import { Pool } from 'pg';
import { env } from '../config/env.js';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000
    });
  }
  return pool;
}
