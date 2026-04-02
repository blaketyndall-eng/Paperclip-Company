import { Router } from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

export const docsRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiPath = path.resolve(__dirname, '../../../docs/openapi.json');

docsRouter.get('/docs/openapi.json', async (_req, res) => {
  try {
    const raw = await readFile(openApiPath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(raw);
  } catch {
    res.status(500).json({
      error: 'OPENAPI_NOT_AVAILABLE',
      message: 'OpenAPI contract file could not be loaded'
    });
  }
});
