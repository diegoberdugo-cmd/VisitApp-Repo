import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

export default {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'visitapp-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'visitapp.db'),
};
