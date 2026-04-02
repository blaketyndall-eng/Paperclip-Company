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
  LLM_PROVIDER_ORDER: z.string().default('anthropic,openai,gemini'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-haiku-latest'),
  ANTHROPIC_MAX_RETRIES: z.coerce.number().default(3),
  ANTHROPIC_INPUT_COST_PER_MILLION: z.coerce.number().default(0.8),
  ANTHROPIC_OUTPUT_COST_PER_MILLION: z.coerce.number().default(4),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_MAX_RETRIES: z.coerce.number().default(3),
  OPENAI_INPUT_COST_PER_MILLION: z.coerce.number().default(0.15),
  OPENAI_OUTPUT_COST_PER_MILLION: z.coerce.number().default(0.6),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  GEMINI_MAX_RETRIES: z.coerce.number().default(3),
  GEMINI_INPUT_COST_PER_MILLION: z.coerce.number().default(0.075),
  GEMINI_OUTPUT_COST_PER_MILLION: z.coerce.number().default(0.3)
});

export const env = envSchema.parse(process.env);
