export function recalculateVisitState(db, visitaId) {
  const integrantes = db.prepare(`
    SELECT estado_actual FROM integrante_visita WHERE visita_id = ?
  `).all(visitaId);

  if (integrantes.length === 0) {
    return 'ACTIVA';
  }

  const allDefinitive = integrantes.every((i) => i.estado_actual === 'SALIDA_DEFINITIVA');
  const allInside = integrantes.every((i) => i.estado_actual === 'DENTRO');

  let estado;
  if (allDefinitive) {
    estado = 'FINALIZADA';
  } else if (allInside) {
    estado = 'ACTIVA';
  } else {
    estado = 'PARCIAL';
  }

  db.prepare('UPDATE visita SET estado_general = ? WHERE id = ?').run(estado, visitaId);
  return estado;
}
