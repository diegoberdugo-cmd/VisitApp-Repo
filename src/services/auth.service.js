import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { getDb, runInTransaction } from '../database/db.js';
import { ensureUniqueVisitCode, generateIndividualCode } from '../utils/codes.js';
import { recalculateVisitState } from '../utils/visitState.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Servicio de autenticación y login
 * Maneja login de usuarios internos, generación de JWT y registro de ingreso
 */

/**
 * @function login
 * @description Autentica un usuario y retorna token JWT + registro de ingreso
 * @param {string} email - Email o cédula del usuario
 * @param {string} password - Contraseña en texto plano
 * @returns {object} { token, user, registro_ingreso }
 *
 * Pasos:
 * 1. Busca usuario por email O cédula en tabla usuario_interno con JOIN a rol
 * 2. Valida que el usuario exista y esté activo (estado = 1)
 * 3. Verifica la contraseña con bcrypt.compareSync
 * 4. Genera token JWT con id, cédula y rol del usuario (expira en JWT_EXPIRES_IN)
 * 5. Crea una visita automática de tipo FUNCIONARIO/ADMINISTRADOR
 *    - Busca un área activa disponible
 *    - Genera código de visita único (ensureUniqueVisitCode)
 *    - Inserta en tabla visita
 *    - Crea integrante principal con tipo_persona según rol
 *    - Registra movimiento de ENTRADA
 * 6. Retorna token, datos del usuario y códigos de ingreso
 */
export function login(email, password) {
  const db = getDb();

  // Paso 1: Buscar usuario por email o cédula con JOIN a tabla rol
  const user = db.prepare(`
    SELECT u.*, r.nombre as rol_nombre
    FROM usuario_interno u
    JOIN rol r ON r.id = u.rol_id
    WHERE u.email = ? OR u.cedula = ?
  `).get(email, email);

  // Paso 2: Validar que el usuario exista y esté activo
  if (!user || !user.estado) {
    throw new AppError('Credenciales inválidas o usuario inactivo', 401);
  }

  // Paso 3: Verificar contraseña con bcrypt
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    throw new AppError('Credenciales inválidas o usuario inactivo', 401);
  }

  // Paso 4: Generar token JWT con payload: id, cédula, rol
  const token = jwt.sign(
    { id: user.id, cedula: user.cedula, rol: user.rol_nombre },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  // Paso 5: Determinar tipo de persona según el rol
  const tipoPersona = user.rol_nombre === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : 'VIGILANTE';
  const tipoIngreso = user.rol_nombre;

  // Paso 6: Crear visita automática de ingreso operativo
  const visitResult = runInTransaction(() => {
    // 6a. Buscar un área activa para la visita
    const area = db.prepare('SELECT id FROM area WHERE estado = 1 LIMIT 1').get();
    if (!area) throw new AppError('No hay áreas configuradas', 500);

    // 6b. Generar código de visita único (formato: VA-XXXXXX)
    const codigoVisita = ensureUniqueVisitCode(db);

    // 6c. Insertar registro en tabla visita
    const visitInsert = db.prepare(`
      INSERT INTO visita (codigo_visita, tipo_usuario_ingreso, area_id, motivo_visita, estado_general)
      VALUES (?, ?, ?, ?, 'ACTIVA')
    `);
    const visitInfo = visitInsert.run(codigoVisita, tipoIngreso, area.id, 'Ingreso operativo personal interno');
    const visitaId = visitInfo.lastInsertRowid;

    // 6d. Generar código individual del integrante (formato: VA-XXXXXX-01)
    const codigoIndividual = generateIndividualCode(codigoVisita, 1);

    // 6e. Insertar integrante principal (el usuario que hace login)
    const memberInsert = db.prepare(`
      INSERT INTO integrante_visita (
        visita_id, codigo_individual, tipo_persona, nombre_completo, cedula, telefono, estado_actual
      ) VALUES (?, ?, ?, ?, ?, ?, 'DENTRO')
    `);
    const memberInfo = memberInsert.run(
      visitaId, codigoIndividual, tipoPersona, user.nombre_completo, user.cedula, null
    );

    // 6f. Registrar movimiento de ENTRADA para el integrante
    db.prepare(`
      INSERT INTO movimiento_acceso (integrante_visita_id, tipo_movimiento, registrado_por_usuario_id)
      VALUES (?, 'ENTRADA', ?)
    `).run(memberInfo.lastInsertRowid, user.id);

    return { codigo_visita: codigoVisita, codigo_individual: codigoIndividual };
  });

  // Paso 7: Retornar token, datos del usuario y códigos de ingreso
  return {
    token,
    user: {
      id: user.id,
      cedula: user.cedula,
      nombre_completo: user.nombre_completo,
      email: user.email,
      rol: user.rol_nombre,
    },
    registro_ingreso: visitResult,
  };
}
