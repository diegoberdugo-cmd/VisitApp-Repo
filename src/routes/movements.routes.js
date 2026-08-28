import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  registerExit,
  registerReEntry,
  confirmDefinitiveExit,
  finalizeVisit,
  exitByCodeCedula,
  exitSchema,
  reEntrySchema,
  confirmExitSchema,
  finalizeVisitSchema,
  exitByCodeCedulaSchema,
} from '../controllers/movements.controller.js';

const router = Router();

/**
 * @route POST /api/v1/movements/exit
 * @description Registra la salida de un integrante de la visita
 * @access Public
 * @body {number} integrante_id - ID del integrante que sale
 * @body {string} tipo_salida - 'TEMPORAL' o 'DEFINITIVA'
 *   - TEMPORAL: El integrante puede reingresar después
 *   - DEFINITIVA: Se cierra el registro del integrante
 * @returns {object} 200 - { mensaje: 'Salida registrada', movimiento: { id, tipo, fecha_hora } }
 */
router.post('/exit', validate(exitSchema), registerExit);

/**
 * @route POST /api/v1/movements/exit/by-code
 * @description Registra salida individual por código de visita + cédula (HU-07)
 * @access Public
 * @body {string} codigo_visita - Código de la visita
 * @body {string} cedula - Cédula del integrante que sale
 * @body {string} [observacion] - Observación sobre la salida (opcional)
 * @returns {object} 200 - { integrante_id, codigo_individual, estado_actual, codigo_visita, estado_general }
 */
router.post('/exit/by-code', validate(exitByCodeCedulaSchema), exitByCodeCedula);

/**
 * @route POST /api/v1/movements/re-entry
 * @description Registra el reingreso de un integrante con salida temporal
 * @access Public
 * @body {string} codigo_visita - Código de la visita (ej: VA-583921)
 * @body {number} integrante_id - ID del integrante que reingresa
 * @returns {object} 200 - { mensaje: 'Reingreso registrado' }
 */
router.post('/re-entry', validate(reEntrySchema), registerReEntry);

/**
 * @route POST /api/v1/movements/finalize
 * @description Finaliza una visita completa: salida definitiva de TODOS los integrantes DENTRO por código (HU-06)
 * @access Public
 * @body {string} codigo_visita - Código de la visita (ej: VA-583921)
 * @body {string} [observacion] - Observación sobre la salida (opcional)
 * @returns {object} 200 - { codigo_visita, integrantes_salieron, integrantes, estado_general }
 */
router.post('/finalize', validate(finalizeVisitSchema), finalizeVisit);

/**
 * @route PATCH /api/v1/movements/confirm-definitive-exit
 * @description Confirma la salida definitiva de un integrante (sin autenticación)
 * @access Public
 * @body {number} integrante_id - ID del integrante
 * @body {string} [observacion] - Observación sobre la salida (opcional sin auth)
 * @returns {object} 200 - { mensaje: 'Salida definitiva confirmada' }
 */
router.patch('/confirm-definitive-exit', validate(confirmExitSchema), confirmDefinitiveExit);

/**
 * @route PATCH /api/v1/movements/confirm-definitive-exit/guard
 * @description Confirma la salida definitiva por vigilante autenticado
 * @access Private (VIGILANTE, ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @body {number} integrante_id - ID del integrante
 * @body {string} observacion - Observación (obligatoria para vigilante)
 * @returns {object} 200 - { mensaje: 'Salida definitiva confirmada por vigilante' }
 */
router.patch('/confirm-definitive-exit/guard', authenticate, validate(confirmExitSchema), confirmDefinitiveExit);

export default router;
