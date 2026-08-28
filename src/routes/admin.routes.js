import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, validateQuery } from '../middleware/validate.js';
import {
  getAuditLogs,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listAreas,
  createArea,
  updateArea,
  deleteArea,
  listRoles,
  exportReport,
  createUserSchema,
  updateUserSchema,
  createAreaSchema,
  updateAreaSchema,
  auditQuerySchema,
} from '../controllers/admin.controller.js';

const router = Router();

router.use(authenticate, authorize('ADMINISTRADOR'));

/**
 * @route GET /api/v1/admin/audit-logs
 * @description Historial de movimientos del sistema con paginación y filtros de fecha
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @query {number} [page=1] - Número de página
 * @query {number} [limit=20] - Registros por página (max: 100)
 * @query {string} [desde] - Fecha/hora inicial (ISO 8601)
 * @query {string} [hasta] - Fecha/hora final (ISO 8601)
 * @returns {object} 200 - { logs: [...], paginacion: { page, limit, total, totalPaginas } }
 */
router.get('/audit-logs', validateQuery(auditQuerySchema), getAuditLogs);

/**
 * @route GET /api/v1/admin/report
 * @description Exporta reporte CSV de movimientos filtrado por intervalos de fechas (HU-10)
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @query {string} [desde] - Fecha inicial (ISO 8601)
 * @query {string} [hasta] - Fecha final (ISO 8601)
 * @returns {string} 200 - Archivo CSV descargable
 */
router.get('/report', validateQuery(auditQuerySchema), exportReport);

/**
 * @route GET /api/v1/admin/roles
 * @description Lista todos los roles del sistema
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @returns {Array<{id: number, nombre: string, descripcion: string}>} 200 - Lista de roles
 */
router.get('/roles', listRoles);

/**
 * @route GET /api/v1/admin/users
 * @description Lista todos los usuarios internos del sistema
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @returns {Array} 200 - Usuarios con id, nombre_completo, cedula, email, estado, rol, creado_en
 */
router.get('/users', listUsers);

/**
 * @route POST /api/v1/admin/users
 * @description Crea un nuevo usuario interno
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @body {string} nombre_completo - Nombre completo (requerido)
 * @body {string} cedula - Cédula única (requerido)
 * @body {string} email - Email válido y único (requerido)
 * @body {string} password - Contraseña min 6 caracteres (requerido)
 * @body {string} rol - 'ADMINISTRADOR' o 'VIGILANTE' (requerido)
 * @returns {object} 200 - { usuario: { id, nombre_completo, cedula, email, rol, estado } }
 */
router.post('/users', validate(createUserSchema), createUser);

/**
 * @route PUT /api/v1/admin/users/:id
 * @description Actualiza datos de un usuario existente
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @param {number} id - ID del usuario (path param)
 * @body {string} [nombre_completo] - Nuevo nombre
 * @body {string} [email] - Nuevo email válido
 * @body {string} [password] - Nueva contraseña min 6 caracteres
 * @body {string} [rol] - 'ADMINISTRADOR' o 'VIGILANTE'
 * @body {boolean} [estado] - true=activar, false=desactivar
 * @returns {object} 200 - { usuario actualizado }
 */
router.put('/users/:id', validate(updateUserSchema), updateUser);

/**
 * @route DELETE /api/v1/admin/users/:id
 * @description Desactiva un usuario (soft delete)
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @param {number} id - ID del usuario (path param)
 * @returns {object} 200 - { message: 'Usuario desactivado' }
 */
router.delete('/users/:id', deleteUser);

/**
 * @route GET /api/v1/admin/areas
 * @description Lista todas las áreas (activas e inactivas)
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @returns {Array<{id: number, nombre: string, estado: boolean, creado_en: string}>} 200 - Lista de áreas
 */
router.get('/areas', listAreas);

/**
 * @route POST /api/v1/admin/areas
 * @description Crea una nueva área
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @body {string} nombre - Nombre único del área (requerido)
 * @returns {object} 200 - { area: { id, nombre, estado, creado_en } }
 */
router.post('/areas', validate(createAreaSchema), createArea);

/**
 * @route PUT /api/v1/admin/areas/:id
 * @description Actualiza nombre o estado de un área
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @param {number} id - ID del área (path param)
 * @body {string} [nombre] - Nuevo nombre
 * @body {boolean} [estado] - true=activar, false=desactivar
 * @returns {object} 200 - { area actualizada }
 */
router.put('/areas/:id', validate(updateAreaSchema), updateArea);

/**
 * @route DELETE /api/v1/admin/areas/:id
 * @description Desactiva un área (soft delete)
 * @access Private (ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @param {number} id - ID del área (path param)
 * @returns {object} 200 - { message: 'Area desactivada' }
 */
router.delete('/areas/:id', deleteArea);

export default router;
