import bcrypt from 'bcryptjs';
import { getDb } from './db.js';
import { initDatabase } from './init.js';

export function seedDatabase() {
  initDatabase();
  const db = getDb();

  const existingRoles = db.prepare('SELECT COUNT(*) as count FROM rol').get();
  if (existingRoles.count > 0) {
    console.log('La base de datos ya tiene datos. Seed omitido.');
    return;
  }

  const insertRol = db.prepare('INSERT INTO rol (nombre, descripcion) VALUES (?, ?)');
  insertRol.run('ADMINISTRADOR', 'Administrador del sistema VisitAPP');
  insertRol.run('VIGILANTE', 'Personal de vigilancia y control de acceso');

  const insertArea = db.prepare('INSERT INTO area (nombre) VALUES (?)');
  const areas = ['Gerencia General', 'Sistemas', 'Logística', 'Recursos Humanos', 'Producción'];
  for (const area of areas) {
    insertArea.run(area);
  }

  const passwordHash = bcrypt.hashSync('Admin123!', 10);
  db.prepare(`
    INSERT INTO usuario_interno (nombre_completo, cedula, email, password_hash, rol_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Administrador Sistema', '1000000001', 'admin@mastersolution.com', passwordHash, 1);

  const vigilanteHash = bcrypt.hashSync('Vigilante123!', 10);
  db.prepare(`
    INSERT INTO usuario_interno (nombre_completo, cedula, email, password_hash, rol_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Juan Pérez Vigilante', '1000000002', 'vigilante@mastersolution.com', vigilanteHash, 2);

  db.prepare(`
    INSERT INTO funcionario (cedula, nombre_completo, email, telefono, area_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('2000000001', 'María García Funcionaria', 'maria.garcia@mastersolution.com', '3001234567', 2);

  db.prepare(`
    INSERT INTO acompanante_autorizado (funcionario_id, nombre_completo, cedula)
    VALUES (?, ?, ?)
  `).run(1, 'Pedro Acompañante Autorizado', '3000000001');

  console.log('Datos de prueba insertados correctamente.');
  console.log('  Admin: admin@mastersolution.com / Admin123!');
  console.log('  Vigilante: vigilante@mastersolution.com / Vigilante123!');
}

if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase();
}
