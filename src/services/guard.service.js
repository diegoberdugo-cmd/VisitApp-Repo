import { getDb } from '../database/db.js';

/**
 * Servicio de vigilante
 * Maneja consulta de visitas activas y búsqueda por filtros
 */

/**
 * @function mapVisitWithMembers
 * @description Transforma una visita con sus integrantes al formato de respuesta
 * @param {object} row - Fila de la visita desde la BD
 * @param {Array} integrantes - Lista de integrantes de la visita
 * @returns {object} Visita formateada con integrantes y resumen de conteo
 *
 * Pasos:
 * 1. Extrae datos de la visita (código, área, motivo, estado, fecha)
 * 2. Mapea cada integrante con sus campos relevantes
 * 3. Calcula resumen: cuántos dentro, fuera temporal, fuera definitiva
 */
function mapVisitWithMembers(row, integrantes) {
  return {
    // Datos de la visita
    id: row.id,
    codigo_visita: row.codigo_visita,
    tipo_usuario_ingreso: row.tipo_usuario_ingreso,
    area: row.area_nombre,
    motivo_visita: row.motivo_visita,
    estado_general: row.estado_general,
    creado_en: row.creado_en,

    // Lista de integrantes con sus datos
    integrantes: integrantes.map((i) => ({
      id: i.id,
      codigo_individual: i.codigo_individual,
      nombre_completo: i.nombre_completo,
      cedula: i.cedula,
      tipo_persona: i.tipo_persona,
      estado_actual: i.estado_actual,
      ingresa_vehiculo: !!i.ingresa_vehiculo,
      placa_vehiculo: i.placa_vehiculo,
    })),

    // Resumen de conteo por estado
    resumen: {
      dentro: integrantes.filter((i) => i.estado_actual === 'DENTRO').length,
      fuera_temporal: integrantes.filter((i) => i.estado_actual === 'SALIDA_TEMPORAL').length,
      fuera_definitiva: integrantes.filter((i) => i.estado_actual === 'SALIDA_DEFINITIVA').length,
    },
  };
}

/**
 * @function getActiveVisits
 * @description Lista todas las visitas activas con sus integrantes
 * @returns {Array} Lista de visitas activas (estado ACTIVA o PARCIAL)
 *
 * Pasos:
 * 1. Consulta todas las visitas con estado ACTIVA o PARCIAL
 * 2. JOIN con tabla area para obtener nombre del área
 * 3. Ordena por fecha de creación descendente (más recientes primero)
 * 4. Para cada visita, obtiene todos sus integrantes
 * 5. Transforma cada visita al formato de respuesta con resumen
 */
export function getActiveVisits() {
  const db = getDb();

  // Paso 1-3: Consultar visitas activas con área, ordenadas por fecha
  const visitas = db.prepare(`
    SELECT v.*, a.nombre as area_nombre
    FROM visita v
    JOIN area a ON a.id = v.area_id
    WHERE v.estado_general IN ('ACTIVA', 'PARCIAL')
    ORDER BY v.creado_en DESC
  `).all();

  // Paso 4: Preparar statement para obtener integrantes
  const getMembers = db.prepare(`
    SELECT * FROM integrante_visita WHERE visita_id = ? ORDER BY id
  `);

  // Paso 5: Transformar cada visita al formato de respuesta
  return visitas.map((v) => mapVisitWithMembers(v, getMembers.all(v.id)));
}

/**
 * @function searchVisits
 * @description Busca visitas por código, nombre, cédula o placa con filtros combinables
 * @param {object} filters - Filtros de búsqueda
 * @param {string} [filters.query] - Búsqueda general (busca en código, nombre, cédula, placa)
 * @param {string} [filters.cedula] - Filtrar por cédula específica
 * @param {string} [filters.placa] - Filtrar por placa específica
 * @returns {Array} Lista de visitas que coinciden con los filtros
 *
 * Pasos:
 * 1. Inicia condiciones base: solo visitas ACTIVAS o PARCIALES
 * 2. Si hay filtro query:
 *    - Busca en código de visita (LIKE con %)
 *    - Busca en nombre, cédula o placa de integrantes (subquery con EXISTS)
 * 3. Si hay filtro cedula:
 *    - Busca integrantes con esa cédula (subquery con EXISTS)
 * 4. Si hay filtro placa:
 *    - Busca integrantes con esa placa (subquery con EXISTS)
 * 5. Combina condiciones con AND
 * 6. Ejecuta query con parámetros dinámicos
 * 7. Para cada visita, obtiene integrantes y transforma al formato respuesta
 */
export function searchVisits(filters = {}) {
  const db = getDb();

  // Paso 1: Condición base - solo visitas activas o parciales
  const conditions = ["v.estado_general IN ('ACTIVA', 'PARCIAL')"];
  const params = [];

  // Paso 2: Filtro query general (código, nombre, cédula, placa)
  if (filters.query) {
    conditions.push(`(
      v.codigo_visita LIKE ? OR
      EXISTS (
        SELECT 1 FROM integrante_visita iv
        WHERE iv.visita_id = v.id AND (
          iv.nombre_completo LIKE ? OR iv.cedula LIKE ? OR iv.placa_vehiculo LIKE ?
        )
      )
    )`);
    const term = `%${filters.query}%`;
    params.push(term, term, term, term);
  }

  // Paso 3: Filtro cédula específica
  if (filters.cedula) {
    conditions.push(`EXISTS (
      SELECT 1 FROM integrante_visita iv WHERE iv.visita_id = v.id AND iv.cedula LIKE ?
    )`);
    params.push(`%${filters.cedula}%`);
  }

  // Paso 4: Filtro placa específica
  if (filters.placa) {
    conditions.push(`EXISTS (
      SELECT 1 FROM integrante_visita iv
      WHERE iv.visita_id = v.id AND iv.placa_vehiculo LIKE ?
    )`);
    params.push(`%${filters.placa}%`);
  }

  // Paso 5: Combinar condiciones con AND
  const where = conditions.join(' AND ');

  // Paso 6: Ejecutar query con parámetros dinámicos
  const visitas = db.prepare(`
    SELECT v.*, a.nombre as area_nombre
    FROM visita v
    JOIN area a ON a.id = v.area_id
    WHERE ${where}
    ORDER BY v.creado_en DESC
  `).all(...params);

  // Paso 7: Obtener integrantes y transformar cada visita
  const getMembers = db.prepare(`
    SELECT * FROM integrante_visita WHERE visita_id = ? ORDER BY id
  `);

  return visitas.map((v) => mapVisitWithMembers(v, getMembers.all(v.id)));
}
