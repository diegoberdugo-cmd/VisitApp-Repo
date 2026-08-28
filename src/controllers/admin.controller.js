import { z } from 'zod';
import * as adminService from '../services/admin.service.js';

export const createUserSchema = z.object({
  nombre_completo: z.string().min(1),
  cedula: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  rol: z.enum(['ADMINISTRADOR', 'VIGILANTE']),
});

export const updateUserSchema = z.object({
  nombre_completo: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  rol: z.enum(['ADMINISTRADOR', 'VIGILANTE']).optional(),
  estado: z.boolean().optional(),
});

export const createAreaSchema = z.object({
  nombre: z.string().min(1),
});

export const updateAreaSchema = z.object({
  nombre: z.string().optional(),
  estado: z.boolean().optional(),
});

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

export function getAuditLogs(req, res) {
  res.json(adminService.getAuditLogs(req.query));
}

export function exportReport(req, res, next) {
  try {
    const csv = adminService.exportReport(req.query);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-visitas-${date}.csv"`);
    res.send(`\uFEFF${csv}`);
  } catch (err) {
    next(err);
  }
}

export function listUsers(req, res) {
  res.json(adminService.listUsers());
}

export function createUser(req, res, next) {
  try {
    const user = adminService.createUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export function updateUser(req, res, next) {
  try {
    const user = adminService.updateUser(Number(req.params.id), req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export function deleteUser(req, res, next) {
  try {
    res.json(adminService.deleteUser(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
}

export function listAreas(req, res) {
  res.json(adminService.listAreasAdmin());
}

export function createArea(req, res, next) {
  try {
    res.status(201).json(adminService.createArea(req.body.nombre));
  } catch (err) {
    next(err);
  }
}

export function updateArea(req, res, next) {
  try {
    res.json(adminService.updateArea(Number(req.params.id), req.body));
  } catch (err) {
    next(err);
  }
}

export function deleteArea(req, res, next) {
  try {
    res.json(adminService.deleteArea(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
}

export function listRoles(req, res) {
  res.json(adminService.listRoles());
}
