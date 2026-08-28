import { z } from 'zod';
import * as movementsService from '../services/movements.service.js';

export const exitSchema = z.object({
  integrante_id: z.number().int().positive(),
  tipo_salida: z.enum(['TEMPORAL', 'DEFINITIVA']),
});

export const reEntrySchema = z.object({
  codigo_visita: z.string().min(1),
  integrante_id: z.number().int().positive(),
});

export const confirmExitSchema = z.object({
  integrante_id: z.number().int().positive(),
  observacion: z.string().optional(),
});

export const finalizeVisitSchema = z.object({
  codigo_visita: z.string().min(1, 'Código de visita requerido'),
  observacion: z.string().optional(),
});

export const exitByCodeCedulaSchema = z.object({
  codigo_visita: z.string().min(1, 'Código de visita requerido'),
  cedula: z.string().min(1, 'Cédula requerida'),
  observacion: z.string().optional(),
});

export function registerExit(req, res, next) {
  try {
    const result = movementsService.registerExit(req.body.integrante_id, req.body.tipo_salida);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export function registerReEntry(req, res, next) {
  try {
    const { codigo_visita, integrante_id } = req.body;
    const result = movementsService.registerReEntry(codigo_visita, integrante_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export function confirmDefinitiveExit(req, res, next) {
  try {
    const isVigilante = !!req.user;
    const result = movementsService.confirmDefinitiveExit(req.body.integrante_id, {
      observacion: req.body.observacion,
      usuarioId: req.user?.id,
      isVigilante,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export function finalizeVisit(req, res, next) {
  try {
    const result = movementsService.finalizeVisit(req.body.codigo_visita, {
      observacion: req.body.observacion,
      usuarioId: req.user?.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export function exitByCodeCedula(req, res, next) {
  try {
    const result = movementsService.registerExitWithCodeAndCedula(
      req.body.codigo_visita,
      req.body.cedula,
      { observacion: req.body.observacion, usuarioId: req.user?.id }
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
