import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { login, loginSchema } from '../controllers/auth.controller.js';

const router = Router();

/**
 * @route POST /api/v1/auth/login
 * @description Inicia sesión y retorna token JWT válido por 8 horas
 * @access Public
 * @body {string} email - Email o cédula del usuario
 * @body {string} password - Contraseña del usuario
 * @returns {object} 200 - { token: 'eyJhbG...', usuario: { id, nombre_completo, email, rol } }
 */
router.post('/login', validate(loginSchema), login);

export default router;
