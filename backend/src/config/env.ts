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
  GOOGLE_USERINFO_URL: z.string().default('https://openidconnect.googleapis.com/v1/userinfo'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  WORKFLOW_EXECUTION_MODE: z.enum(['inline', 'bull']).default('inline'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-haiku-latest'),
  ANTHROPIC_MAX_RETRIES: z.coerce.number().default(3),
  ANTHROPIC_INPUT_COST_PER_MILLION: z.coerce.number().default(0.8),
  ANTHROPIC_OUTPUT_COST_PER_MILLION: z.coerce.number().default(4)
});

export const env = envSchema.parse(process.env);
