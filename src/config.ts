import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  // Number of reverse proxies in front of the API; needed for a correct client IP in rate limits
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.string().min(1),
  // Comma-separated frontend origins allowed to call the API from a browser
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(30),

  MAGIC_LINK_URL: z.string().url().default('http://localhost:3000/auth/verify'),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().positive().default(15),
  // Anti-spam limits for POST /auth/request-link
  MAGIC_LINK_COOLDOWN_SECONDS: z.coerce.number().min(0).default(60),
  MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR: z.coerce.number().int().positive().default(5),
  MAGIC_LINK_MAX_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  // Network adapter to send mail through (e.g. "Ethernet"), bypassing a VPN that blocks SMTP
  SMTP_INTERFACE: z.string().optional(),
  // Defaults to the SMTP account; most providers reject or rewrite any other sender
  MAIL_FROM: z.string().optional(),
}).refine((env) => env.MAIL_FROM || z.email().safeParse(env.SMTP_USER).success, {
  path: ['MAIL_FROM'],
  // Services like Resend use a fixed login ("resend"), which can't serve as the sender
  message: 'MAIL_FROM is required when SMTP_USER is not an email address',
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  ...parsed.data,
  MAIL_FROM: parsed.data.MAIL_FROM || `YourDashBoard <${parsed.data.SMTP_USER}>`,
};
