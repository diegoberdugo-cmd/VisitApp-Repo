import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { getActiveVisits, searchVisits, searchSchema } from '../controllers/guard.controller.js';

const router = Router();

router.use(authenticate, authorize('VIGILANTE', 'ADMINISTRADOR'));

/**
 * @route GET /api/v1/guard/active-visits
 * @description Lista todas las visitas activas (estado ACTIVA o PARCIAL)
 * @access Private (VIGILANTE, ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @returns {Array} 200 - Visitas activas con integrantes y conteo
 */
router.get('/active-visits', getActiveVisits);

/**
 * @route GET /api/v1/guard/search
 * @description Busca visitas por código, nombre, cédula o placa
 * @access Private (VIGILANTE, ADMINISTRADOR)
 * @header {string} Authorization - Bearer token JWT
 * @query {string} [query] - Búsqueda general (código, nombre, cédula, placa)
 * @query {string} [cedula] - Filtrar por cédula específica
 * @query {string} [placa] - Filtrar por placa específica
 * @returns {Array} 200 - Visitas que coinciden con la búsqueda
 */
router.get('/search', validateQuery(searchSchema), searchVisits);

export default router;
