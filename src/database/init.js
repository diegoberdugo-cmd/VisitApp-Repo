import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import { getDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function initDatabase() {
  const db = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  console.log('Base de datos inicializada:', config.dbPath);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('init.js')) {
  initDatabase();
}
