import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors.js';
import { verifyAccessToken, type JwtPayload } from './auth.service.js';

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'Требуется заголовок Authorization: Bearer <token>');
  }
  try {
    req.auth = verifyAccessToken(token);
  } catch {
    throw new HttpError(401, 'Токен недействителен или истёк');
  }
  next();
}
