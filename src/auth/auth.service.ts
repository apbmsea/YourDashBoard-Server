import { createHash, randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { sendMagicLink } from '../mailer.js';
import { assertCanRequestLink } from './rate-limit.js';

export interface JwtPayload {
  sub: string;
  email: string;
}

const DAY_MS = 24 * 60 * 60_000;

const newToken = () => randomBytes(32).toString('base64url');
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function requestMagicLink(email: string, ip: string | undefined): Promise<void> {
  await assertCanRequestLink(email, ip);

  const token = newToken();
  const row = await prisma.loginToken.create({
    data: {
      email,
      ip,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + config.MAGIC_LINK_TTL_MINUTES * 60_000),
    },
  });

  const link = new URL(config.MAGIC_LINK_URL);
  link.searchParams.set('token', token);
  try {
    await sendMagicLink(email, link.toString());
  } catch (err) {
    // Don't let a failed send eat into the user's rate limit
    await prisma.loginToken.delete({ where: { id: row.id } });
    console.error('Failed to send magic link:', err);
    throw new HttpError(502, 'Не удалось отправить письмо, попробуйте позже');
  }

  const now = new Date();
  await prisma.$transaction([
    // Only the most recent link stays valid
    prisma.loginToken.updateMany({
      where: { email, usedAt: null, id: { not: row.id } },
      data: { usedAt: now },
    }),
    // Rows older than the rate-limit window are no longer needed
    prisma.loginToken.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - DAY_MS) } } }),
  ]);
}

// Login and registration in one step: the user is created on first successful verify.
export async function verifyMagicLink(token: string) {
  const tokenHash = hashToken(token);
  const now = new Date();

  // Atomic "claim" so the same link can't be used twice by parallel requests
  const claimed = await prisma.loginToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count === 0) {
    throw new HttpError(400, 'Ссылка недействительна или устарела');
  }

  const { email } = await prisma.loginToken.findUniqueOrThrow({ where: { tokenHash } });
  const existing = await prisma.user.findUnique({ where: { email } });
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, lastLoginAt: now },
    update: { lastLoginAt: now },
  });

  return { ...(await issueTokens(user)), isNewUser: !existing, user };
}

// Rotation: every refresh token works once and is replaced by a new one.
export async function refreshTokens(refreshToken: string) {
  const invalid = new HttpError(401, 'Refresh-токен недействителен или истёк');
  const now = new Date();

  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });
  if (!row || row.expiresAt <= now) throw invalid;

  const claimed = await prisma.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: now },
  });
  if (claimed.count === 0) {
    // An already-rotated token came back: it was probably stolen, so end all sessions of this user
    await prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    throw invalid;
  }

  return issueTokens(row.user);
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function issueTokens(user: { id: string; email: string }) {
  const refreshToken = newToken();
  const now = Date.now();
  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date(now) } } }),
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(now + config.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
      },
    }),
  ]);

  const accessToken = jwt.sign({ email: user.email }, config.JWT_SECRET, {
    subject: user.id,
    algorithm: 'HS256',
    expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): JwtPayload {
  const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof payload === 'string' || !payload.sub) {
    throw new Error('Malformed token payload');
  }
  return { sub: payload.sub, email: payload.email };
}
