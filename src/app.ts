import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { ZodError } from 'zod';
import { authRouter } from './auth/auth.routes.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { HttpError } from './errors.js';
import { openapi } from './openapi.js';

export const app = express();

app.set('trust proxy', config.TRUST_PROXY);

app.use(cors({ origin: config.CORS_ORIGINS }));
app.use(express.json());

app.get('/docs.json', (_req, res) => {
  res.json(openapi);
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map((i) => i.message).join('; ') });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).set(err.headers).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Некорректный JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
