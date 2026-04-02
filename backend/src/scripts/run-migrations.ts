import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../db/pool.js';
import { applyMigrations } from '../services/migration-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../migrations');

async function run(): Promise<void> {
  const pool = getPool();
  const applied = await applyMigrations(pool, migrationsDir);

  for (const file of applied) {
    // eslint-disable-next-line no-console
    console.log(`Applied migration: ${file}`);
  }

  await pool.end();
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Migration runner failed', error);
  process.exit(1);
});
