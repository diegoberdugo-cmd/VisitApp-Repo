import { z } from 'zod';
import * as visitsService from '../services/visits.service.js';

const acompananteSchema = z.object({
  nombre_completo: z.string().min(1),
  cedula: z.string().min(1),
  telefono: z.string().optional(),
});

export const visitorVisitSchema = z.object({
  nombre_completo: z.string().min(1, 'Nombre requerido'),
  cedula: z.string().min(1, 'Cédula requerida'),
  telefono: z.string().min(1, 'Teléfono requerido'),
  contacto_emergencia: z.string().optional(),
  area_id: z.number().int().positive('Área requerida'),
  funcionario_id: z.number().int().positive().optional(),
  motivo_visita: z.string().min(1, 'Motivo requerido'),
  eps: z.string().optional(),
  arl: z.string().optional(),
  ingresa_vehiculo: z.boolean().default(false),
  placa_vehiculo: z.string().optional(),
  acompanantes: z.array(acompananteSchema).default([]),
}).refine(
  (data) => !data.ingresa_vehiculo || (data.placa_vehiculo && data.placa_vehiculo.length > 0),
  { message: 'Placa obligatoria si ingresa vehículo', path: ['placa_vehiculo'] }
);

export const verifyCodeSchema = z.object({
  codigo_visita: z.string().min(1, 'Código de visita requerido'),
});

export const funcionarioLookupSchema = z.object({
  cedula: z.string().min(1),
});

export const funcionarioVisitSchema = z.object({
  cedula: z.string().min(1),
  motivo_visita: z.string().optional(),
  acompanantes_ids: z.array(z.number().int()).default([]),
});

export function registerVisitor(req, res, next) {
  try {
    const result = visitsService.registerVisitorVisit(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export function verifyCode(req, res, next) {
  try {
    const result = visitsService.verifyVisitCode(req.body.codigo_visita);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export function lookupFuncionario(req, res, next) {
  try {
    const result = visitsService.lookupFuncionario(req.params.cedula);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export function registerFuncionario(req, res, next) {
  try {
    const result = visitsService.registerFuncionarioVisit(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export function listAreas(req, res) {
  res.json(visitsService.listAreas());
}

export function listFuncionariosByArea(req, res) {
  try {
    const result = visitsService.listFuncionariosByArea(req.params.areaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
