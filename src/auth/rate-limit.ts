import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';

const HOUR_MS = 60 * 60_000;

function tooMany(retryAfterMs: number): HttpError {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new HttpError(429, `Слишком много запросов. Повторите через ${seconds} сек.`, {
    'Retry-After': String(seconds),
  });
}

// Limits are counted from LoginToken rows, so they survive restarts and
// are shared between several API instances.
export async function assertCanRequestLink(email: string, ip: string | undefined): Promise<void> {
  const now = Date.now();
  const hourAgo = new Date(now - HOUR_MS);

  const byEmail = await prisma.loginToken.findMany({
    where: { email, createdAt: { gt: hourAgo } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const last = byEmail[0];
  if (last) {
    const cooldownLeft = last.createdAt.getTime() + config.MAGIC_LINK_COOLDOWN_SECONDS * 1000 - now;
    if (cooldownLeft > 0) throw tooMany(cooldownLeft);
  }
  if (byEmail.length >= config.MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR) {
    // A slot frees up when the oldest request in the window turns one hour old
    throw tooMany(byEmail[byEmail.length - 1]!.createdAt.getTime() + HOUR_MS - now);
  }

  if (ip) {
    const byIp = await prisma.loginToken.findMany({
      where: { ip, createdAt: { gt: hourAgo } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (byIp.length >= config.MAGIC_LINK_MAX_PER_IP_PER_HOUR) {
      throw tooMany(byIp[0]!.createdAt.getTime() + HOUR_MS - now);
    }
  }
}
