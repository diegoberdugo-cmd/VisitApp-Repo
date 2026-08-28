import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  registerVisitor,
  verifyCode,
  lookupFuncionario,
  registerFuncionario,
  listAreas,
  listFuncionariosByArea,
  visitorVisitSchema,
  verifyCodeSchema,
  funcionarioVisitSchema,
} from '../controllers/visits.controller.js';

const router = Router();

/**
 * @route GET /api/v1/visits/areas
 * @description Lista todas las áreas activas disponibles para visitas
 * @access Public
 * @returns {Array<{id: number, nombre: string}>} 200 - Lista de áreas activas
 */
router.get('/areas', listAreas);

/**
 * @route GET /api/v1/visits/areas/:areaId/funcionarios
 * @description Lista funcionarios activos de un área determinada (selección jerárquica HU-03)
 * @access Public
 * @param {number} areaId - ID del área (path param)
 * @returns {Array<{id, nombre_completo, cedula}>} 200 - Lista de funcionarios del área
 */
router.get('/areas/:areaId/funcionarios', listFuncionariosByArea);

/**
 * @route POST /api/v1/visits/visitor
 * @description Registra una visita de un visitante externo. Genera código único (VA-XXXXXX)
 * @access Public
 * @body {string} nombre_completo - Nombre completo del visitante (requerido)
 * @body {string} cedula - Número de cédula (requerido)
 * @body {string} telefono - Teléfono del visitante (requerido)
 * @body {string} contacto_emergencia - Contacto de emergencia (requerido)
 * @body {number} area_id - ID del área a visitar (requerido, obtener de GET /areas)
 * @body {string} motivo_visita - Motivo de la visita (requerido)
 * @body {string} [eps] - EPS del visitante (opcional)
 * @body {string} [arl] - ARL del visitante (opcional)
 * @body {boolean} [ingresa_vehiculo=false] - Si ingresa con vehículo (opcional)
 * @body {string} [placa_vehiculo] - Placa del vehículo (requerido si ingresa_vehiculo=true)
 * @body {Array<{nombre_completo: string, cedula: string, telefono?: string}>} [acompanantes=[]] - Acompañantes (opcional)
 * @returns {object} 200 - { codigo_visita: 'VA-583921', mensaje: 'Visita registrada exitosamente' }
 */
router.post('/visitor', validate(visitorVisitSchema), registerVisitor);

/**
 * @route POST /api/v1/visits/verify-code
 * @description Verifica código de visita y retorna detalles + integrantes
 * @access Public
 * @body {string} codigo_visita - Código de la visita (ej: VA-583921)
 * @returns {object} 200 - { codigo_visita, estado_general, area_nombre, motivo_visita, fecha_hora, integrantes: [...] }
 */
router.post('/verify-code', validate(verifyCodeSchema), verifyCode);

/**
 * @route GET /api/v1/visits/funcionario/:cedula
 * @description Consulta funcionario por cédula y retorna acompañantes autorizados
 * @access Public
 * @param {string} cedula - Número de cédula del funcionario (path param)
 * @returns {object} 200 - { funcionario: { id, nombre_completo, cedula, cargo, area }, acompanantes_autorizados: [...] }
 */
router.get('/funcionario/:cedula', lookupFuncionario);

/**
 * @route POST /api/v1/visits/funcionario
 * @description Registra ingreso de funcionario interno con acompañantes autorizados
 * @access Public
 * @body {string} cedula - Cédula del funcionario (requerido)
 * @body {string} [motivo_visita='Ingreso funcionario'] - Motivo del ingreso (opcional)
 * @body {number[]} [acompanantes_ids=[]] - IDs de acompañantes autorizados (opcional)
 * @returns {object} 200 - { codigo_visita: 'VA-XXXXXX', mensaje: 'Ingreso de funcionario registrado' }
 */
router.post('/funcionario', validate(funcionarioVisitSchema), registerFuncionario);

export default router;
