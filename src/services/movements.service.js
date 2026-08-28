import { getDb, runInTransaction } from '../database/db.js';
import { recalculateVisitState } from '../utils/visitState.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Servicio de movimientos de acceso
 * Maneja entradas, salidas temporales/definitivas y reingresos de integrantes
 */

/**
 * @function getIntegrante
 * @description Obtiene un integrante por ID con información de su visita
 * @param {object} db - Conexión a la base de datos
 * @param {number} integranteId - ID del integrante
 * @returns {object|null} Integrante con datos de la visita o null si no existe
 *
 * Pasos:
 * 1. Consulta integrante_visita con JOIN a tabla visita
 * 2. Retorna integrante con estado_actual, codigo_visita, visita_estado
 */
function getIntegrante(db, integranteId) {
  return db.prepare(`
    SELECT iv.*, v.codigo_visita, v.estado_general as visita_estado
    FROM integrante_visita iv
    JOIN visita v ON v.id = iv.visita_id
    WHERE iv.id = ?
  `).get(integranteId);
}

/**
 * @function registerExit
 * @description Registra la salida de un integrante (temporal o definitiva)
 * @param {number} integranteId - ID del integrante que sale
 * @param {string} tipoSalida - 'TEMPORAL' o 'DEFINITIVA'
 * @returns {object} { integrante_id, codigo_individual, estado_actual, codigo_visita, estado_general }
 *
 * Pasos:
 * 1. Busca el integrante por ID con datos de la visita
 * 2. Valida que el integrante exista
 * 3. Valida que la visita NO esté FINALIZADA
 * 4. Valida que el integrante esté en estado DENTRO
 * 5. Determina tipo de movimiento: SALIDA_TEMPORAL o SALIDA_DEFINITIVA
 * 6. Dentro de transacción:
 *    a. Registra movimiento de salida en tabla movimiento_acceso
 *    b. Actualiza estado_actual del integrante
 *    c. Recalcula estado general de la visita (ACTIVA/PARCIAL/FINALIZADA)
 *    d. Retorna datos actualizados del integrante
 */
export function registerExit(integranteId, tipoSalida) {
  const db = getDb();

  // Paso 1: Buscar integrante con datos de la visita
  const integrante = getIntegrante(db, integranteId);

  // Paso 2: Validar que el integrante exista
  if (!integrante) {
    throw new AppError('Integrante no encontrado', 404);
  }

  // Paso 3: Validar que la visita NO esté finalizada
  if (integrante.visita_estado === 'FINALIZADA') {
    throw new AppError('La visita ya está finalizada', 422);
  }

  // Paso 4: Validar que el integrante esté dentro
  if (integrante.estado_actual !== 'DENTRO') {
    throw new AppError('La persona no está en estado DENTRO', 400);
  }

  // Paso 5: Determinar tipo de movimiento según tipo_salida
  const movementType = tipoSalida === 'TEMPORAL' ? 'SALIDA_TEMPORAL' : 'SALIDA_DEFINITIVA';
  const newState = movementType;

  // Paso 6: Ejecutar todo dentro de una transacción ACID
  return runInTransaction(() => {
    // 6a. Registrar movimiento de salida en tabla movimiento_acceso
    db.prepare(`
      INSERT INTO movimiento_acceso (integrante_visita_id, tipo_movimiento)
      VALUES (?, ?)
    `).run(integranteId, movementType);

    // 6b. Actualizar estado_actual del integrante
    db.prepare('UPDATE integrante_visita SET estado_actual = ? WHERE id = ?').run(newState, integranteId);

    // 6c. Recalcular estado general de la visita (ACTIVA/PARCIAL/FINALIZADA)
    const estadoGeneral = recalculateVisitState(db, integrante.visita_id);

    // 6d. Retornar datos actualizados del integrante
    return {
      integrante_id: integranteId,
      codigo_individual: integrante.codigo_individual,
      estado_actual: newState,
      codigo_visita: integrante.codigo_visita,
      estado_general: estadoGeneral,
    };
  });
}

/**
 * @function registerReEntry
 * @description Registra el reingreso de un integrante con salida temporal
 * @param {string} codigoVisita - Código de la visita (ej: VA-583921)
 * @param {number} integranteId - ID del integrante que reingresa
 * @returns {object} { integrante_id, codigo_individual, estado_actual, codigo_visita, estado_general }
 *
 * Pasos:
 * 1. Busca la visita por código
 * 2. Valida que la visita exista y NO esté finalizada
 * 3. Busca el integrante dentro de esa visita específica
 * 4. Valida que el integrante pertenezca a esa visita
 * 5. Valida que NO tenga salida definitiva
 * 6. Valida que tenga estado SALIDA_TEMPORAL (único estado permitido para reingreso)
 * 7. Dentro de transacción:
 *    a. Registra movimiento de ENTRADA
 *    b. Actualiza estado del integrante a DENTRO
 *    c. Recalcula estado general de la visita
 *    d. Retorna datos actualizados
 */
export function registerReEntry(codigoVisita, integranteId) {
  const db = getDb();

  // Paso 1: Buscar visita por código
  const visita = db.prepare('SELECT * FROM visita WHERE codigo_visita = ?').get(codigoVisita);

  // Paso 2: Validar que la visita exista y NO esté finalizada
  if (!visita) {
    throw new AppError('Código de visita no encontrado', 404);
  }
  if (visita.estado_general === 'FINALIZADA') {
    throw new AppError('La visita ya está finalizada', 422);
  }

  // Paso 3: Buscar integrante dentro de esa visita específica
  const integrante = db.prepare(`
    SELECT * FROM integrante_visita WHERE id = ? AND visita_id = ?
  `).get(integranteId, visita.id);

  // Paso 4: Validar que el integrante pertenezca a esa visita
  if (!integrante) {
    throw new AppError('Integrante no encontrado en esta visita', 404);
  }

  // Paso 5: Validar que NO tenga salida definitiva
  if (integrante.estado_actual === 'SALIDA_DEFINITIVA') {
    throw new AppError('No se puede reingresar: salida definitiva registrada', 422);
  }

  // Paso 6: Validar que esté en SALIDA_TEMPORAL (único estado para reingreso)
  if (integrante.estado_actual !== 'SALIDA_TEMPORAL') {
    throw new AppError('La persona debe estar en SALIDA_TEMPORAL para reingresar', 400);
  }

  // Paso 7: Ejecutar todo dentro de una transacción ACID
  return runInTransaction(() => {
    // 7a. Registrar movimiento de ENTRADA
    db.prepare(`
      INSERT INTO movimiento_acceso (integrante_visita_id, tipo_movimiento)
      VALUES (?, 'ENTRADA')
    `).run(integranteId);

    // 7b. Actualizar estado del integrante a DENTRO
    db.prepare("UPDATE integrante_visita SET estado_actual = 'DENTRO' WHERE id = ?").run(integranteId);

    // 7c. Recalcular estado general de la visita
    const estadoGeneral = recalculateVisitState(db, visita.id);

    // 7d. Retornar datos actualizados
    return {
      integrante_id: integranteId,
      codigo_individual: integrante.codigo_individual,
      estado_actual: 'DENTRO',
      codigo_visita: visita.codigo_visita,
      estado_general: estadoGeneral,
    };
  });
}

/**
 * @function finalizeVisit
 * @description Finaliza una visita completa: registra salida definitiva de TODOS los integrantes en estado DENTRO
 * @param {string} codigoVisita - Código de la visita (ej: VA-583921)
 * @param {object} options - Opciones adicionales
 * @param {string} [options.observacion] - Observación sobre la salida
 * @param {number} [options.usuarioId] - ID del usuario que registra (si es vigilante)
 * @returns {object} { codigo_visita, integrantes_salieron, estado_general }
 *
 * Pasos:
 * 1. Busca la visita por código
 * 2. Valida que la visita exista
 * 3. Valida que la visita NO esté FINALIZADA
 * 4. Identifica todos los integrantes en estado DENTRO
 * 5. Si no hay nadie DENTRO, lanza error
 * 6. Dentro de transacción:
 *    a. Registra movimiento SALIDA_DEFINITIVA para cada integrante DENTRO
 *    b. Actualiza estado de cada uno a SALIDA_DEFINITIVA
 *    c. Recalcula estado general de la visita (quedará FINALIZADA)
 *    d. Retorna código de visita y lista de integrantes que salieron
 */
export function finalizeVisit(codigoVisita, options = {}) {
  const db = getDb();
  const { observacion, usuarioId } = options;

  // Paso 1: Buscar visita por código
  const visita = db.prepare('SELECT * FROM visita WHERE codigo_visita = ?').get(codigoVisita);

  // Paso 2: Validar que la visita exista
  if (!visita) {
    throw new AppError('Código de visita no encontrado', 404);
  }

  // Paso 3: Validar que la visita NO esté FINALIZADA
  if (visita.estado_general === 'FINALIZADA') {
    throw new AppError('La visita ya está finalizada', 422);
  }

  // Paso 4: Identificar integrantes en estado DENTRO
  const integrantesDentro = db.prepare(`
    SELECT id, codigo_individual, nombre_completo
    FROM integrante_visita
    WHERE visita_id = ? AND estado_actual = 'DENTRO'
  `).all(visita.id);

  // Paso 5: Validar que exista al menos un integrante DENTRO
  if (integrantesDentro.length === 0) {
    throw new AppError('No hay integrantes dentro para finalizar la visita', 400);
  }

  // Paso 6: Ejecutar todo dentro de una transacción ACID
  return runInTransaction(() => {
    const insertMovement = db.prepare(`
      INSERT INTO movimiento_acceso (
        integrante_visita_id, tipo_movimiento, observacion_cierre, registrado_por_usuario_id
      ) VALUES (?, 'SALIDA_DEFINITIVA', ?, ?)
    `);
    const updateState = db.prepare("UPDATE integrante_visita SET estado_actual = 'SALIDA_DEFINITIVA' WHERE id = ?");

    let contador = 0;

    // 6a-6b: Para cada integrante DENTRO, registrar salida definitiva y actualizar estado
    for (const integrante of integrantesDentro) {
      insertMovement.run(integrante.id, observacion || null, usuarioId || null);
      updateState.run(integrante.id);
      contador += 1;
    }

    // 6c: Recalcular estado general (quedará FINALIZADA porque todos salieron)
    const estadoGeneral = recalculateVisitState(db, visita.id);

    // 6d: Retornar resultado
    return {
      codigo_visita: visita.codigo_visita,
      integrantes_salieron: contador,
      integrantes: integrantesDentro,
      estado_general: estadoGeneral,
    };
  });
}

/**
 * @function registerExitWithCodeAndCedula
 * @description Registra salida individual de un integrante buscándolo por código de visita + cédula (HU-07)
 * @param {string} codigoVisita - Código de la visita (ej: VA-583921)
 * @param {string} cedula - Cédula del integrante
 * @param {object} options - Opciones adicionales
 * @param {string} [options.observacion] - Observación sobre la salida
 * @param {number} [options.usuarioId] - ID del usuario que registra (si es vigilante)
 * @returns {object} { integrante_id, codigo_individual, estado_actual, codigo_visita, estado_general }
 *
 * Pasos:
 * 1. Busca la visita por código
 * 2. Valida que la visita exista y NO esté FINALIZADA
 * 3. Busca el integrante por cédula dentro de esa visita
 * 4. Valida que el integrante pertenezca a la visita
 * 5. Valida que el integrante esté en estado DENTRO
 * 6. Dentro de transacción:
 *    a. Registra movimiento SALIDA_DEFINITIVA
 *    b. Actualiza estado a SALIDA_DEFINITIVA
 *    c. Recalcula estado general (PARCIAL o FINALIZADA)
 *    d. Retorna datos actualizados
 */
export function registerExitWithCodeAndCedula(codigoVisita, cedula, options = {}) {
  const db = getDb();
  const { observacion, usuarioId } = options;

  // Paso 1: Buscar visita por código
  const visita = db.prepare('SELECT * FROM visita WHERE codigo_visita = ?').get(codigoVisita);

  // Paso 2: Validar que la visita exista y NO esté FINALIZADA
  if (!visita) {
    throw new AppError('Código de visita no encontrado', 404);
  }
  if (visita.estado_general === 'FINALIZADA') {
    throw new AppError('La visita ya está finalizada', 422);
  }

  // Paso 3: Buscar integrante por cédula dentro de la visita
  const integrante = db.prepare(`
    SELECT * FROM integrante_visita WHERE visita_id = ? AND cedula = ?
  `).get(visita.id, cedula);

  // Paso 4: Validar que el integrante pertenezca a la visita
  if (!integrante) {
    throw new AppError('La cédula no pertenece a esta visita', 404);
  }

  // Paso 5: Validar que el integrante esté en estado DENTRO
  if (integrante.estado_actual !== 'DENTRO') {
    throw new AppError('La persona no está en estado DENTRO', 400);
  }

  // Paso 6: Ejecutar todo dentro de una transacción ACID
  return runInTransaction(() => {
    // 6a. Registrar movimiento SALIDA_DEFINITIVA
    db.prepare(`
      INSERT INTO movimiento_acceso (
        integrante_visita_id, tipo_movimiento, observacion_cierre, registrado_por_usuario_id
      ) VALUES (?, 'SALIDA_DEFINITIVA', ?, ?)
    `).run(integrante.id, observacion || null, usuarioId || null);

    // 6b. Actualizar estado a SALIDA_DEFINITIVA
    db.prepare("UPDATE integrante_visita SET estado_actual = 'SALIDA_DEFINITIVA' WHERE id = ?")
      .run(integrante.id);

    // 6c. Recalcular estado general (PARCIAL o FINALIZADA)
    const estadoGeneral = recalculateVisitState(db, visita.id);

    // 6d. Retornar datos actualizados
    return {
      integrante_id: integrante.id,
      codigo_individual: integrante.codigo_individual,
      estado_actual: 'SALIDA_DEFINITIVA',
      codigo_visita: visita.codigo_visita,
      estado_general: estadoGeneral,
    };
  });
}

/**
 * @function confirmDefinitiveExit
 * @description Confirma la salida definitiva de un integrante con salida temporal
 * @param {number} integranteId - ID del integrante
 * @param {object} options - Opciones adicionales
 * @param {string} [options.observacion] - Observación sobre la salida
 * @param {number} [options.usuarioId] - ID del usuario que registra (si es vigilante)
 * @param {boolean} [options.isVigilante=false] - Si es acción de vigilante (requiere observación)
 * @returns {object} { integrante_id, codigo_individual, estado_actual, codigo_visita, estado_general }
 *
 * Pasos:
 * 1. Busca el integrante por ID con datos de la visita
 * 2. Valida que el integrante exista
 * 3. Valida que NO esté DENTRO (no puede confirmar salida si está dentro)
 * 4. Valida que NO tenga salida definitiva ya registrada
 * 5. Valida que esté en SALIDA_TEMPORAL (único estado para confirmar definitiva)
 * 6. Si es vigilante, valida que la observación NO esté vacía
 * 7. Dentro de transacción:
 *    a. Registra movimiento SALIDA_DEFINITIVA con observación
 *    b. Actualiza estado del integrante a SALIDA_DEFINITIVA
 *    c. Recalcula estado general de la visita
 *    d. Retorna datos actualizados
 */
export function confirmDefinitiveExit(integranteId, options = {}) {
  const db = getDb();
  const { observacion, usuarioId, isVigilante } = options;

  // Paso 1: Buscar integrante con datos de la visita
  const integrante = getIntegrante(db, integranteId);

  // Paso 2: Validar que el integrante exista
  if (!integrante) {
    throw new AppError('Integrante no encontrado', 404);
  }

  // Paso 3: Validar que NO esté DENTRO
  if (integrante.estado_actual === 'DENTRO') {
    throw new AppError('No se puede confirmar salida definitiva: la persona está DENTRO', 400);
  }

  // Paso 4: Validar que NO tenga salida definitiva ya registrada
  if (integrante.estado_actual === 'SALIDA_DEFINITIVA') {
    throw new AppError('La persona ya tiene salida definitiva', 422);
  }

  // Paso 5: Validar que esté en SALIDA_TEMPORAL
  if (integrante.estado_actual !== 'SALIDA_TEMPORAL') {
    throw new AppError('Solo se puede confirmar desde SALIDA_TEMPORAL', 400);
  }

  // Paso 6: Si es vigilante, validar que la observación NO esté vacía
  if (isVigilante && !observacion?.trim()) {
    throw new AppError('Observación obligatoria para acciones del vigilante', 400);
  }

  // Paso 7: Ejecutar todo dentro de una transacción ACID
  return runInTransaction(() => {
    // 7a. Registrar movimiento SALIDA_DEFINITIVA con observación y usuario
    db.prepare(`
      INSERT INTO movimiento_acceso (
        integrante_visita_id, tipo_movimiento, observacion_cierre, registrado_por_usuario_id
      ) VALUES (?, 'SALIDA_DEFINITIVA', ?, ?)
    `).run(integranteId, observacion || null, usuarioId || null);

    // 7b. Actualizar estado del integrante a SALIDA_DEFINITIVA
    db.prepare("UPDATE integrante_visita SET estado_actual = 'SALIDA_DEFINITIVA' WHERE id = ?")
      .run(integranteId);

    // 7c. Recalcular estado general de la visita
    const estadoGeneral = recalculateVisitState(db, integrante.visita_id);

    // 7d. Retornar datos actualizados
    return {
      integrante_id: integranteId,
      codigo_individual: integrante.codigo_individual,
      estado_actual: 'SALIDA_DEFINITIVA',
      codigo_visita: integrante.codigo_visita,
      estado_general: estadoGeneral,
    };
  });
}
