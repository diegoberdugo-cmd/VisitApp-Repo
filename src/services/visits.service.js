import { getDb, runInTransaction } from '../database/db.js';
import { ensureUniqueVisitCode, generateIndividualCode } from '../utils/codes.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Servicio de visitas
 * Maneja registro de visitantes, verificación de códigos y gestión de funcionarios
 */

/**
 * @function registerVisitorVisit
 * @description Registra una visita de un visitante externo con acompañantes
 * @param {object} data - Datos del visitante
 * @param {string} data.nombre_completo - Nombre completo
 * @param {string} data.cedula - Cédula
 * @param {string} data.telefono - Teléfono
 * @param {string} data.contacto_emergencia - Contacto de emergencia
 * @param {number} data.area_id - ID del área a visitar
 * @param {string} data.motivo_visita - Motivo de la visita
 * @param {string} [data.eps] - EPS (opcional)
 * @param {string} [data.arl] - ARL (opcional)
 * @param {boolean} [data.ingresa_vehiculo=false] - Si ingresa con vehículo
 * @param {string} [data.placa_vehiculo] - Placa del vehículo (requerido si ingresa_vehiculo=true)
 * @param {Array} [data.acompanantes=[]] - Lista de acompañantes
 * @returns {object} { codigo_visita, visita_id, area, integrantes, estado_general }
 *
 * Pasos:
 * 1. Valida que el area_id exista y esté activa
 * 2. Dentro de transacción:
 *    a. Genera código de visita único (VA-XXXXXX)
 *    b. Inserta registro en tabla visita con estado ACTIVA
 *    c. Crea integrante principal (VISITANTE_PRINCIPAL)
 *    d. Registra movimiento de ENTRADA para el principal
 *    e. Para cada acompañante:
 *       - Genera código individual secuencial (VA-XXXXXX-02, -03, etc.)
 *       - Inserta como ACOMPANANTE_VISITA
 *       - Registra movimiento de ENTRADA
 *    f. Retorna código de visita e información de todos los integrantes
 */
export function registerVisitorVisit(data) {
  const db = getDb();

  // Paso 1: Validar que el área exista y esté activa
  const area = db.prepare('SELECT id, nombre FROM area WHERE id = ? AND estado = 1').get(data.area_id);
  if (!area) {
    throw new AppError('Área no válida o inactiva', 400);
  }

  // Paso 2: Ejecutar todo dentro de una transacción ACID
  return runInTransaction(() => {
    // 2a. Generar código de visita único (formato: VA-XXXXXX)
    const codigoVisita = ensureUniqueVisitCode(db);

    // 2b. Insertar registro en tabla visita (con funcionario_id si se proporciona)
    const visitInsert = db.prepare(`
      INSERT INTO visita (codigo_visita, tipo_usuario_ingreso, area_id, motivo_visita, estado_general, funcionario_id)
      VALUES (?, 'VISITANTE', ?, ?, 'ACTIVA', ?)
    `);
    const visitResult = visitInsert.run(codigoVisita, data.area_id, data.motivo_visita, data.funcionario_id || null);
    const visitaId = visitResult.lastInsertRowid;

    // 2c. Preparar statements para insertar integrantes y movimientos
    const insertMember = db.prepare(`
      INSERT INTO integrante_visita (
        visita_id, codigo_individual, tipo_persona, nombre_completo, cedula,
        telefono, eps, arl, ingresa_vehiculo, placa_vehiculo, contacto_emergencia, estado_actual
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DENTRO')
    `);

    const insertMovement = db.prepare(`
      INSERT INTO movimiento_acceso (integrante_visita_id, tipo_movimiento)
      VALUES (?, 'ENTRADA')
    `);

    let index = 1;
    const integrantes = [];

    // 2d. Crear integrante principal (VISITANTE_PRINCIPAL)
    const principalCode = generateIndividualCode(codigoVisita, index);
    const principalResult = insertMember.run(
      visitaId, principalCode, 'VISITANTE_PRINCIPAL',
      data.nombre_completo, data.cedula, data.telefono,
      data.eps || null, data.arl || null,
      data.ingresa_vehiculo ? 1 : 0, data.placa_vehiculo || null,
      data.contacto_emergencia || null
    );
    // 2e. Registrar movimiento de ENTRADA para el principal
    insertMovement.run(principalResult.lastInsertRowid);
    integrantes.push({
      id: principalResult.lastInsertRowid,
      codigo_individual: principalCode,
      nombre_completo: data.nombre_completo,
      tipo_persona: 'VISITANTE_PRINCIPAL',
    });

    // 2f. Crear acompañantes (ACOMPANANTE_VISITA)
    for (const acomp of data.acompanantes || []) {
      index += 1;
      const code = generateIndividualCode(codigoVisita, index);
      const result = insertMember.run(
        visitaId, code, 'ACOMPANANTE_VISITA',
        acomp.nombre_completo, acomp.cedula,
        acomp.telefono || null, null, null, 0, null, null
      );
      // Registrar movimiento de ENTRADA para cada acompañante
      insertMovement.run(result.lastInsertRowid);
      integrantes.push({
        id: result.lastInsertRowid,
        codigo_individual: code,
        nombre_completo: acomp.nombre_completo,
        tipo_persona: 'ACOMPANANTE_VISITA',
      });
    }

    // 2g. Retornar información completa de la visita
    return {
      codigo_visita: codigoVisita,
      visita_id: visitaId,
      area: area.nombre,
      integrantes,
      estado_general: 'ACTIVA',
    };
  });
}

/**
 * @function verifyVisitCode
 * @description Verifica un código de visita y retorna detalles + integrantes
 * @param {string} codigoVisita - Código de la visita (ej: VA-583921)
 * @returns {object} { codigo_visita, estado_general, area, motivo_visita, integrantes }
 *
 * Pasos:
 * 1. Busca la visita por código con JOIN a tabla area
 * 2. Valida que la visita exista
 * 3. Valida que la visita NO esté FINALIZADA
 * 4. Obtiene todos los integrantes de la visita
 * 5. Retorna datos de la visita + lista de integrantes con su estado
 */
export function verifyVisitCode(codigoVisita) {
  const db = getDb();

  // Paso 1: Buscar visita por código con JOIN a área
  const visita = db.prepare(`
    SELECT v.*, a.nombre as area_nombre
    FROM visita v
    JOIN area a ON a.id = v.area_id
    WHERE v.codigo_visita = ?
  `).get(codigoVisita);

  // Paso 2: Validar que la visita exista
  if (!visita) {
    throw new AppError('Código de visita no encontrado', 404);
  }

  // Paso 3: Validar que la visita NO esté finalizada
  if (visita.estado_general === 'FINALIZADA') {
    throw new AppError('La visita ya está finalizada', 422);
  }

  // Paso 4: Obtener todos los integrantes de la visita
  const integrantes = db.prepare(`
    SELECT id, codigo_individual, nombre_completo, cedula, tipo_persona, estado_actual
    FROM integrante_visita
    WHERE visita_id = ?
    ORDER BY id
  `).all(visita.id);

  // Paso 5: Retornar datos completos de la visita
  return {
    codigo_visita: visita.codigo_visita,
    estado_general: visita.estado_general,
    area: visita.area_nombre,
    motivo_visita: visita.motivo_visita,
    integrantes,
  };
}

/**
 * @function lookupFuncionario
 * @description Consulta un funcionario por cédula y retorna acompañantes autorizados
 * @param {string} cedula - Cédula del funcionario
 * @returns {object} { funcionario, acompanantes_autorizados }
 *
 * Pasos:
 * 1. Busca funcionario por cédula con JOIN a tabla area
 * 2. Valida que el funcionario exista y esté activo
 * 3. Obtiene los acompañantes autorizados del funcionario
 * 4. Retorna datos del funcionario + lista de acompañantes autorizados
 */
export function lookupFuncionario(cedula) {
  const db = getDb();

  // Paso 1: Buscar funcionario por cédula con JOIN a área
  const funcionario = db.prepare(`
    SELECT f.*, a.nombre as area_nombre
    FROM funcionario f
    JOIN area a ON a.id = f.area_id
    WHERE f.cedula = ? AND f.estado = 1
  `).get(cedula);

  // Paso 2: Validar que el funcionario exista y esté activo
  if (!funcionario) {
    throw new AppError('Funcionario no encontrado', 404);
  }

  // Paso 3: Obtener acompañantes autorizados del funcionario
  const acompanantes = db.prepare(`
    SELECT id, nombre_completo, cedula
    FROM acompanante_autorizado
    WHERE funcionario_id = ? AND estado = 1
  `).all(funcionario.id);

  // Paso 4: Retornar información completa
  return { funcionario, acompanantes_autorizados: acompanantes };
}

/**
 * @function registerFuncionarioVisit
 * @description Registra el ingreso de un funcionario con acompañantes autorizados
 * @param {object} data - Datos del ingreso
 * @param {string} data.cedula - Cédula del funcionario
 * @param {string} [data.motivo_visita='Ingreso funcionario'] - Motivo del ingreso
 * @param {number[]} [data.acompanantes_ids=[]] - IDs de acompañantes autorizados a incluir
 * @returns {object} { codigo_visita, visita_id, integrantes, estado_general }
 *
 * Pasos:
 * 1. Busca el funcionario por cédula (reutiliza lookupFuncionario)
 * 2. Dentro de transacción:
 *    a. Genera código de visita único (VA-XXXXXX)
 *    b. Inserta registro en tabla visita tipo FUNCIONARIO
 *    c. Crea integrante principal (FUNCIONARIO) con sus datos
 *    d. Registra movimiento de ENTRADA para el funcionario
 *    e. Para cada acompañante autorizado seleccionado:
 *       - Genera código individual secuencial
 *       - Inserta como ACOMPANANTE_FUNCIONARIO
 *       - Registra movimiento de ENTRADA
 *    f. Retorna código de visita e información de todos los integrantes
 */
export function registerFuncionarioVisit(data) {
  const db = getDb();

  // Paso 1: Buscar funcionario y sus acompañantes autorizados
  const { funcionario, acompanantes_autorizados } = lookupFuncionario(data.cedula);

  // Paso 2: Ejecutar todo dentro de una transacción ACID
  return runInTransaction(() => {
    // 2a. Generar código de visita único (formato: VA-XXXXXX)
    const codigoVisita = ensureUniqueVisitCode(db);

    // 2b. Insertar registro en tabla visita tipo FUNCIONARIO
    const visitInsert = db.prepare(`
      INSERT INTO visita (
        codigo_visita, tipo_usuario_ingreso, area_id, motivo_visita, estado_general, funcionario_id
      ) VALUES (?, 'FUNCIONARIO', ?, ?, 'ACTIVA', ?)
    `);
    const visitResult = visitInsert.run(
      codigoVisita, funcionario.area_id, data.motivo_visita || 'Ingreso funcionario', funcionario.id
    );
    const visitaId = visitResult.lastInsertRowid;

    // 2c. Preparar statements para insertar integrantes y movimientos
    const insertMember = db.prepare(`
      INSERT INTO integrante_visita (
        visita_id, codigo_individual, tipo_persona, nombre_completo, cedula, telefono, estado_actual
      ) VALUES (?, ?, ?, ?, ?, ?, 'DENTRO')
    `);
    const insertMovement = db.prepare(`
      INSERT INTO movimiento_acceso (integrante_visita_id, tipo_movimiento)
      VALUES (?, 'ENTRADA')
    `);

    let index = 1;
    const integrantes = [];

    // 2d. Crear integrante principal (FUNCIONARIO)
    const principalCode = generateIndividualCode(codigoVisita, index);
    const principalResult = insertMember.run(
      visitaId, principalCode, 'FUNCIONARIO',
      funcionario.nombre_completo, funcionario.cedula, funcionario.telefono
    );
    // 2e. Registrar movimiento de ENTRADA para el funcionario
    insertMovement.run(principalResult.lastInsertRowid);
    integrantes.push({
      id: principalResult.lastInsertRowid,
      codigo_individual: principalCode,
      nombre_completo: funcionario.nombre_completo,
      tipo_persona: 'FUNCIONARIO',
    });

    // 2f. Crear acompañantes autorizados seleccionados (ACOMPANANTE_FUNCIONARIO)
    const selectedIds = new Set(data.acompanantes_ids || []);
    for (const acomp of acompanantes_autorizados) {
      // Solo incluir si fue seleccionado en el request
      if (!selectedIds.has(acomp.id)) continue;

      index += 1;
      const code = generateIndividualCode(codigoVisita, index);
      const result = insertMember.run(
        visitaId, code, 'ACOMPANANTE_FUNCIONARIO',
        acomp.nombre_completo, acomp.cedula, null
      );
      // Registrar movimiento de ENTRADA para cada acompañante
      insertMovement.run(result.lastInsertRowid);
      integrantes.push({
        id: result.lastInsertRowid,
        codigo_individual: code,
        nombre_completo: acomp.nombre_completo,
        tipo_persona: 'ACOMPANANTE_FUNCIONARIO',
      });
    }

    // 2g. Retornar información completa de la visita
    return {
      codigo_visita: codigoVisita,
      visita_id: visitaId,
      integrantes,
      estado_general: 'ACTIVA',
    };
  });
}

/**
 * @function listAreas
 * @description Lista todas las áreas activas del sistema
 * @returns {Array<{id: number, nombre: string}>} Lista de áreas activas ordenadas por nombre
 */
export function listAreas() {
  const db = getDb();
  return db.prepare('SELECT id, nombre FROM area WHERE estado = 1 ORDER BY nombre').all();
}

/**
 * @function listFuncionariosByArea
 * @description Lista funcionarios activos de un área determinada
 * @param {string} areaId - ID del área
 * @returns {Array<{id, nombre_completo, cedula}>} Lista de funcionarios activos del área
 *
 * Pasos:
 * 1. Consulta funcionarios donde area_id = ? y estado = 1
 * 2. Retorna datos relevantes del funcionario
 */
export function listFuncionariosByArea(areaId) {
  const db = getDb();

  // Paso 1-2: Consultar funcionarios activos del área
  return db.prepare(`
    SELECT id, nombre_completo, cedula
    FROM funcionario
    WHERE area_id = ? AND estado = 1
    ORDER BY nombre_completo
  `).all(areaId);
}
