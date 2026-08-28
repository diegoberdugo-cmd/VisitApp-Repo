import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { getDb } from '../database/db.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const db = getDb();
    const user = db.prepare(`
      SELECT u.id, u.cedula, u.nombre_completo, u.email, u.estado, r.nombre as rol
      FROM usuario_interno u
      JOIN rol r ON r.id = u.rol_id
      WHERE u.id = ?
    `).get(payload.id);

    if (!user || !user.estado) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tiene permisos para esta operación' });
    }
    next();
  };
}
