import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth } from './auth.middleware.js';
import { logout, refreshTokens, requestMagicLink, verifyMagicLink } from './auth.service.js';

const requestLinkBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});
const verifyQuery = z.object({ token: z.string().min(1) });
const refreshBody = z.object({ refreshToken: z.string().min(1) });

export const authRouter = Router();

authRouter.post('/request-link', async (req, res) => {
  const { email } = requestLinkBody.parse(req.body);
  await requestMagicLink(email, req.ip);
  res.json({ message: 'Ссылка для входа отправлена на почту' });
});

authRouter.get('/verify', async (req, res) => {
  const { token } = verifyQuery.parse(req.query);
  res.json(await verifyMagicLink(token));
});

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = refreshBody.parse(req.body);
  res.json(await refreshTokens(refreshToken));
});

authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = refreshBody.parse(req.body);
  await logout(refreshToken);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
  if (!user) throw new HttpError(401, 'Пользователь не найден');
  res.json(user);
});
