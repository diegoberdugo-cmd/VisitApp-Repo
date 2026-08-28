-- VisitAPP - Esquema SQLite (adaptado desde PostgreSQL del documento de arquitectura)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rol (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS area (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  estado INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usuario_interno (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_completo TEXT NOT NULL,
  cedula TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol_id INTEGER NOT NULL REFERENCES rol(id),
  estado INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS funcionario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cedula TEXT NOT NULL UNIQUE,
  nombre_completo TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  area_id INTEGER NOT NULL REFERENCES area(id),
  estado INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS acompanante_autorizado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL REFERENCES funcionario(id) ON DELETE CASCADE,
  nombre_completo TEXT NOT NULL,
  cedula TEXT NOT NULL,
  estado INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visita (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_visita TEXT NOT NULL UNIQUE,
  tipo_usuario_ingreso TEXT NOT NULL CHECK (
    tipo_usuario_ingreso IN ('VISITANTE', 'FUNCIONARIO', 'VIGILANTE', 'ADMINISTRADOR')
  ),
  area_id INTEGER NOT NULL REFERENCES area(id),
  motivo_visita TEXT NOT NULL,
  estado_general TEXT DEFAULT 'ACTIVA' CHECK (
    estado_general IN ('ACTIVA', 'PARCIAL', 'FINALIZADA')
  ),
  funcionario_id INTEGER REFERENCES funcionario(id),
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integrante_visita (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visita_id INTEGER NOT NULL REFERENCES visita(id) ON DELETE CASCADE,
  codigo_individual TEXT NOT NULL UNIQUE,
  tipo_persona TEXT NOT NULL CHECK (
    tipo_persona IN (
      'VISITANTE_PRINCIPAL', 'ACOMPANANTE_VISITA', 'FUNCIONARIO',
      'ACOMPANANTE_FUNCIONARIO', 'VIGILANTE', 'ADMINISTRADOR'
    )
  ),
  nombre_completo TEXT NOT NULL,
  cedula TEXT NOT NULL,
  telefono TEXT,
  eps TEXT,
  arl TEXT,
  ingresa_vehiculo INTEGER DEFAULT 0,
  placa_vehiculo TEXT,
  contacto_emergencia TEXT,
  estado_actual TEXT DEFAULT 'DENTRO' CHECK (
    estado_actual IN ('DENTRO', 'SALIDA_TEMPORAL', 'SALIDA_DEFINITIVA')
  ),
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS movimiento_acceso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integrante_visita_id INTEGER NOT NULL REFERENCES integrante_visita(id) ON DELETE CASCADE,
  tipo_movimiento TEXT NOT NULL CHECK (
    tipo_movimiento IN ('ENTRADA', 'SALIDA_TEMPORAL', 'SALIDA_DEFINITIVA')
  ),
  fecha_hora TEXT DEFAULT (datetime('now')),
  observacion_cierre TEXT,
  registrado_por_usuario_id INTEGER REFERENCES usuario_interno(id)
);

CREATE INDEX IF NOT EXISTS idx_visita_codigo ON visita(codigo_visita);
CREATE INDEX IF NOT EXISTS idx_integrante_codigo ON integrante_visita(codigo_individual);
CREATE INDEX IF NOT EXISTS idx_integrante_cedula ON integrante_visita(cedula);
CREATE INDEX IF NOT EXISTS idx_movimiento_integrante ON movimiento_acceso(integrante_visita_id);
