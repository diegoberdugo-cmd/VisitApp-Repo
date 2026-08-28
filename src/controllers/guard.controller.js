import { z } from 'zod';
import * as guardService from '../services/guard.service.js';

export const searchSchema = z.object({
  query: z.string().optional(),
  cedula: z.string().optional(),
  placa: z.string().optional(),
});

export function getActiveVisits(req, res) {
  res.json(guardService.getActiveVisits());
}

export function searchVisits(req, res) {
  res.json(guardService.searchVisits(req.query));
}
