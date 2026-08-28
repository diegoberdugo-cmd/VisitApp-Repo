import bcrypt from 'bcryptjs';
import { getDb } from '../database/db.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Servicio de administración
 * Maneja CRUD de usuarios, áreas, roles y logs de auditoría
 */

/**
 * @function getAuditLogs
 * @description Obtiene historial de movimientos con paginación y filtros de fecha
 * @param {object} options - Opciones de consulta
 * @param {number} [options.page=1] - Número de página
 * @param {number} [options.limit=20] - Registros por página (max: 100)
 * @param {string} [options.desde] - Fecha/hora inicial (ISO 8601)
 * @param {string} [options.hasta] - Fecha/hora final (ISO 8601)
 * @returns {object} { data: Array, pagination: { page, limit, total, totalPages } }
 *
 * Pasos:
 * 1. Calcula offset para paginación: (page - 1) * limit
 * 2. Construye condiciones dinámicas:
 *    - Si hay 'desde': fecha_hora >= desde
 *    - Si hay 'hasta': fecha_hora <= hasta
 * 3. Cuenta total de registros que coinciden (para paginación)
 * 4. Consulta movimientos con JOINs a:
 *    - integrante_visita (datos del integrante)
 *    - visita (código de visita)
 *    - usuario_interno (quién registró, si aplica)
 * 5. Ordena por fecha_hora descendente (más recientes primero)
 * 6. Aplica LIMIT y OFFSET para paginación
 * 7. Retorna datos + información de paginación
 */
export function getAuditLogs({ page = 1, limit = 20, desde, hasta } = {}) {
  const db = getDb();

  // Paso 1: Calcular offset para paginación
  const offset = (page - 1) * limit;

  // Paso 2: Construir condiciones dinámicas
  const conditions = ['1=1'];
  const params = [];

  if (desde) {
    conditions.push('m.fecha_hora >= ?');
    params.push(desde);
  }
  if (hasta) {
    conditions.push('m.fecha_hora <= ?');
    params.push(hasta);
  }

  // Paso 3: Combinar condiciones
  const where = conditions.join(' AND ');

  // Paso 4: Contar total de registros para paginación
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM movimiento_acceso m WHERE ${where}
  `).get(...params).count;

  // Paso 5-6: Consultar movimientos con JOINs, ordenar y paginar
  const rows = db.prepare(`
    SELECT
      m.id, m.tipo_movimiento, m.fecha_hora, m.observacion_cierre,
      iv.codigo_individual, iv.nombre_completo, iv.cedula,
      v.codigo_visita,
      u.nombre_completo as registrado_por
    FROM movimiento_acceso m
    JOIN integrante_visita iv ON iv.id = m.integrante_visita_id
    JOIN visita v ON v.id = iv.visita_id
    LEFT JOIN usuario_interno u ON u.id = m.registrado_por_usuario_id
    WHERE ${where}
    ORDER BY m.fecha_hora DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  // Paso 7: Retornar datos con información de paginación
  return {
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * @function listUsers
 * @description Lista todos los usuarios internos del sistema
 * @returns {Array} Lista de usuarios con id, nombre, cédula, email, estado, rol, fecha creación
 *
 * Pasos:
 * 1. Consulta tabla usuario_interno con JOIN a tabla rol
 * 2. Selecciona solo campos necesarios (sin password_hash)
 * 3. Ordena por ID
 */
export function listUsers() {
  const db = getDb();

  // Paso 1-3: Consultar usuarios con rol, sin contraseña
  return db.prepare(`
    SELECT u.id, u.nombre_completo, u.cedula, u.email, u.estado, r.nombre as rol, u.creado_en
    FROM usuario_interno u
    JOIN rol r ON r.id = u.rol_id
    ORDER BY u.id
  `).all();
}

/**
 * @function createUser
 * @description Crea un nuevo usuario interno en el sistema
 * @param {object} data - Datos del usuario
 * @param {string} data.nombre_completo - Nombre completo
 * @param {string} data.cedula - Cédula (debe ser única)
 * @param {string} data.email - Email válido (debe ser único)
 * @param {string} data.password - Contraseña min 6 caracteres
 * @param {string} data.rol - 'ADMINISTRADOR' o 'VIGILANTE'
 * @returns {object} Usuario creado sin password
 *
 * Pasos:
 * 1. Valida que el rol exista en tabla rol
 * 2. Verifica que email o cédula NO estén registrados (409 si ya existen)
 * 3. Hashea la contraseña con bcrypt (10 rounds)
 * 4. Inserta usuario en tabla usuario_interno
 * 5. Retorna usuario creado sin campo password
 */
export function createUser(data) {
  const db = getDb();

  // Paso 1: Validar que el rol exista
  const rol = db.prepare('SELECT id FROM rol WHERE nombre = ?').get(data.rol);
  if (!rol) throw new AppError('Rol no válido', 400);

  // Paso 2: Verificar que email o cédula no estén registrados
  const exists = db.prepare('SELECT id FROM usuario_interno WHERE email = ? OR cedula = ?')
    .get(data.email, data.cedula);
  if (exists) throw new AppError('Email o cédula ya registrados', 409);

  // Paso 3: Hashear contraseña con bcrypt (10 rounds de salting)
  const hash = bcrypt.hashSync(data.password, 10);

  // Paso 4: Insertar usuario en la BD
  const result = db.prepare(`
    INSERT INTO usuario_interno (nombre_completo, cedula, email, password_hash, rol_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.nombre_completo, data.cedula, data.email, hash, rol.id);

  // Paso 5: Retornar usuario creado sin contraseña
  return { id: result.lastInsertRowid, ...data, password: undefined };
}

/**
 * @function updateUser
 * @description Actualiza datos de un usuario existente
 * @param {number} id - ID del usuario a actualizar
 * @param {object} data - Campos a actualizar (todos opcionales, al menos 1 requerido)
 * @param {string} [data.nombre_completo] - Nuevo nombre
 * @param {string} [data.email] - Nuevo email válido
 * @param {string} [data.password] - Nueva contraseña
 * @param {string} [data.rol] - Nuevo rol
 * @param {boolean} [data.estado] - Nuevo estado (true=activo, false=inactivo)
 * @returns {object} Usuario actualizado
 *
 * Pasos:
 * 1. Busca el usuario por ID
 * 2. Valida que el usuario exista
 * 3. Construye SET dinámico solo con campos proporcionados
 * 4. Si cambia rol, valida que el nuevo rol exista
 * 5. Si cambia password, hashea la nueva contraseña
 * 6. Valida que al menos 1 campo sea proporcionado
 * 7. Ejecuta UPDATE con campos dinámicos
 * 8. Retorna usuario actualizado con JOIN a rol
 */
export function updateUser(id, data) {
  const db = getDb();

  // Paso 1-2: Buscar usuario y validar que exista
  const user = db.prepare('SELECT * FROM usuario_interno WHERE id = ?').get(id);
  if (!user) throw new AppError('Usuario no encontrado', 404);

  // Paso 3: Construir SET dinámico
  const fields = [];
  const values = [];

  if (data.nombre_completo) { fields.push('nombre_completo = ?'); values.push(data.nombre_completo); }
  if (data.email) { fields.push('email = ?'); values.push(data.email); }
  if (data.estado !== undefined) { fields.push('estado = ?'); values.push(data.estado ? 1 : 0); }

  // Paso 4: Validar rol si se proporciona
  if (data.rol) {
    const rol = db.prepare('SELECT id FROM rol WHERE nombre = ?').get(data.rol);
    if (!rol) throw new AppError('Rol no válido', 400);
    fields.push('rol_id = ?');
    values.push(rol.id);
  }

  // Paso 5: Hashear password si se proporciona
  if (data.password) {
    fields.push('password_hash = ?');
    values.push(bcrypt.hashSync(data.password, 10));
  }

  // Paso 6: Validar que al menos 1 campo sea proporcionado
  if (fields.length === 0) throw new AppError('No hay campos para actualizar', 400);

  // Paso 7: Ejecutar UPDATE con campos dinámicos
  values.push(id);
  db.prepare(`UPDATE usuario_interno SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  // Paso 8: Retornar usuario actualizado con JOIN a rol
  return db.prepare(`
    SELECT u.id, u.nombre_completo, u.cedula, u.email, u.estado, r.nombre as rol
    FROM usuario_interno u JOIN rol r ON r.id = u.rol_id WHERE u.id = ?
  `).get(id);
}

/**
 * @function deleteUser
 * @description Desactiva un usuario (soft delete)
 * @param {number} id - ID del usuario a desactivar
 * @returns {object} { message: 'Usuario desactivado' }
 *
 * Pasos:
 * 1. Ejecuta UPDATE estado = 0 (soft delete)
 * 2. Verifica que se afectó al menos 1 fila (404 si no)
 * 3. Retorna mensaje de confirmación
 */
export function deleteUser(id) {
  const db = getDb();

  // Paso 1-2: Ejecutar soft delete y verificar
  const result = db.prepare('UPDATE usuario_interno SET estado = 0 WHERE id = ?').run(id);
  if (result.changes === 0) throw new AppError('Usuario no encontrado', 404);

  // Paso 3: Retornar confirmación
  return { message: 'Usuario desactivado' };
}

/**
 * @function listAreasAdmin
 * @description Lista todas las áreas (activas e inactivas) para administración
 * @returns {Array<{id, nombre, estado, creado_en}>} Lista de áreas
 *
 * Pasos:
 * 1. Consulta todas las áreas de tabla area
 * 2. Ordena por nombre
 * 3. Retorna con estado y fecha de creación
 */
export function listAreasAdmin() {
  const db = getDb();

  // Paso 1-3: Consultar todas las áreas
  return db.prepare('SELECT id, nombre, estado, creado_en FROM area ORDER BY nombre').all();
}

/**
 * @function createArea
 * @description Crea una nueva área en el sistema
 * @param {string} nombre - Nombre único del área
 * @returns {object} { id, nombre, estado: 1 }
 *
 * Pasos:
 * 1. Intenta insertar el área
 * 2. Si el nombre ya existe (409), lanza error
 * 3. Retorna área creada con estado activo
 */
export function createArea(nombre) {
  const db = getDb();

  try {
    // Paso 1: Insertar área
    const result = db.prepare('INSERT INTO area (nombre) VALUES (?)').run(nombre);

    // Paso 3: Retornar área creada
    return { id: result.lastInsertRowid, nombre, estado: 1 };
  } catch {
    // Paso 2: Error si el nombre ya existe
    throw new AppError('El área ya existe', 409);
  }
}

/**
 * @function updateArea
 * @description Actualiza nombre o estado de un área existente
 * @param {number} id - ID del área a actualizar
 * @param {object} data - Campos a actualizar
 * @param {string} [data.nombre] - Nuevo nombre
 * @param {boolean} [data.estado] - Nuevo estado (true=activa, false=inactiva)
 * @returns {object} Área actualizada
 *
 * Pasos:
 * 1. Busca el área por ID
 * 2. Valida que el área exista
 * 3. Actualiza nombre si se proporciona
 * 4. Actualiza estado si se proporciona
 * 5. Retorna área actualizada
 */
export function updateArea(id, data) {
  const db = getDb();

  // Paso 1-2: Buscar área y validar que exista
  const area = db.prepare('SELECT * FROM area WHERE id = ?').get(id);
  if (!area) throw new AppError('Área no encontrada', 404);

  // Paso 3: Actualizar nombre si se proporciona
  if (data.nombre) {
    db.prepare('UPDATE area SET nombre = ? WHERE id = ?').run(data.nombre, id);
  }

  // Paso 4: Actualizar estado si se proporciona
  if (data.estado !== undefined) {
    db.prepare('UPDATE area SET estado = ? WHERE id = ?').run(data.estado ? 1 : 0, id);
  }

  // Paso 5: Retornar área actualizada
  return db.prepare('SELECT * FROM area WHERE id = ?').get(id);
}

/**
 * @function deleteArea
 * @description Desactiva un área (soft delete)
 * @param {number} id - ID del área a desactivar
 * @returns {object} { message: 'Área desactivada' }
 *
 * Pasos:
 * 1. Ejecuta UPDATE estado = 0 (soft delete)
 * 2. Verifica que se afectó al menos 1 fila (404 si no)
 * 3. Retorna mensaje de confirmación
 */
export function deleteArea(id) {
  const db = getDb();

  // Paso 1-2: Ejecutar soft delete y verificar
  const result = db.prepare('UPDATE area SET estado = 0 WHERE id = ?').run(id);
  if (result.changes === 0) throw new AppError('Área no encontrada', 404);

  // Paso 3: Retornar confirmación
  return { message: 'Área desactivada' };
}

/**
 * @function listRoles
 * @description Lista todos los roles del sistema
 * @returns {Array<{id, nombre, descripcion}>} Lista de roles
 *
 * Pasos:
 * 1. Consulta tabla rol
 * 2. Ordena por ID
 * 3. Retorna con nombre y descripción
 */
export function listRoles() {
  const db = getDb();

  // Paso 1-3: Consultar roles
  return db.prepare('SELECT id, nombre, descripcion FROM rol ORDER BY id').all();
}

/**
 * @function exportReport
 * @description Genera reporte CSV de movimientos filtrado por intervalos de fechas (HU-10)
 * @param {object} options - Opciones de reporte
 * @param {string} [options.desde] - Fecha inicial (ISO 8601)
 * @param {string} [options.hasta] - Fecha final (ISO 8601)
 * @returns {string} CSV con el detalle de visitas y movimientos
 *
 * Pasos:
 * 1. Construye condiciones dinámicas de fechas (desde/hasta)
 * 2. Consulta movimientos con JOINs a integrante y visita
 * 3. Construye encabezados CSV
 * 4. Convierte cada fila a línea CSV escapando comas
 * 5. Retorna string CSV completo
 */
export function exportReport({ desde, hasta } = {}) {
  const db = getDb();

  // Paso 1: Construir condiciones de fecha
  const conditions = ['1=1'];
  const params = [];

  if (desde) {
    conditions.push('m.fecha_hora >= ?');
    params.push(desde);
  }
  if (hasta) {
    conditions.push('m.fecha_hora <= ?');
    params.push(hasta);
  }

  const where = conditions.join(' AND ');

  // Paso 2: Consultar movimientos con JOINs
  const rows = db.prepare(`
    SELECT
      v.codigo_visita,
      iv.codigo_individual,
      iv.nombre_completo,
      iv.cedula,
      iv.tipo_persona,
      iv.estado_actual,
      a.nombre as area,
      m.tipo_movimiento,
      m.fecha_hora,
      COALESCE(u.nombre_completo, 'Sistema') as registrado_por
    FROM movimiento_acceso m
    JOIN integrante_visita iv ON iv.id = m.integrante_visita_id
    JOIN visita v ON v.id = iv.visita_id
    JOIN area a ON a.id = v.area_id
    LEFT JOIN usuario_interno u ON u.id = m.registrado_por_usuario_id
    WHERE ${where}
    ORDER BY m.fecha_hora DESC
  `).all(...params);

  // Paso 3-4: Construir CSV
  const header = ['codigo_visita', 'codigo_individual', 'nombre', 'cedula', 'tipo_persona', 'estado', 'area', 'movimiento', 'fecha_hora', 'registrado_por'];

  const escapeCsv = (value) => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = rows.map((row) => [
    row.codigo_visita,
    row.codigo_individual,
    row.nombre_completo,
    row.cedula,
    row.tipo_persona,
    row.estado_actual,
    row.area,
    row.tipo_movimiento,
    row.fecha_hora,
    row.registrado_por,
  ].map(escapeCsv).join(','));

  // Paso 5: Retornar CSV completo
  return [header.join(','), ...lines].join('\n');
}
