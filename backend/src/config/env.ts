import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  JWT_SECRET: z.string().default('change-me'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/paperclip'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_TOKEN_URL: z.string().default('https://oauth2.googleapis.com/token'),
  GOOGLE_USERINFO_URL: z.string().default('https://openidconnect.googleapis.com/v1/userinfo')
});

export const env = envSchema.parse(process.env);
