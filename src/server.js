import app from './app.js';
import config from './config/index.js';
import { initDatabase } from './database/init.js';
import { seedDatabase } from './database/seed.js';
import { getDb } from './database/db.js';

initDatabase();

const db = getDb();
const roleCount = db.prepare('SELECT COUNT(*) as count FROM rol').get();
if (roleCount.count === 0) {
  seedDatabase();
}

app.listen(config.port, () => {
  console.log(`VisitAPP API escuchando en http://localhost:${config.port}`);
  console.log(`Documentación base: GET http://localhost:${config.port}/api/v1/health`);
});
