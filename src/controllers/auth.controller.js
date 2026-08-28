import { z } from 'zod';
import * as authService from '../services/auth.service.js';

export const loginSchema = z.object({
  email: z.string().min(1, 'Email o cédula requerido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

export function login(req, res, next) {
  try {
    const result = authService.login(req.body.email, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
