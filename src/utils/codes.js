export function generateVisitCode() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `VA-${num}`;
}

export function generateIndividualCode(visitCode, index) {
  return `${visitCode}-${index}`;
}

export function ensureUniqueVisitCode(db) {
  let code;
  let exists = true;
  const check = db.prepare('SELECT id FROM visita WHERE codigo_visita = ?');

  while (exists) {
    code = generateVisitCode();
    exists = !!check.get(code);
  }
  return code;
}
