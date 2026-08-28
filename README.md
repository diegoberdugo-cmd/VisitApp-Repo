# VisitAPP Backend

API REST para el **Sistema de Control de Acceso de Visitantes y Personal** de Master Solution S.A.S.

Implementado en **Node.js + Express** con **SQLite** embebida (archivo local en `data/visitapp.db`), según la arquitectura del documento de requerimientos.

## Requisitos

- [Node.js](https://nodejs.org/) v18 o superior
- npm

## Instalación

```bash
cd C:\Users\diego\Projects\visitapp-backend
copy .env.example .env
npm install
npm start
```

Al iniciar, el servidor crea automáticamente la base de datos y carga datos de prueba si está vacía.

## Usuarios de prueba

| Rol           | Email                         | Contraseña      |
|---------------|-------------------------------|-----------------|
| Administrador | admin@mastersolution.com      | Admin123!       |
| Vigilante     | vigilante@mastersolution.com  | Vigilante123!   |

## Endpoints principales

Base URL: `http://localhost:3000/api/v1`

### Públicos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servicio |
| GET | `/visits/areas` | Listar áreas activas |
| POST | `/visits/visitor` | Registrar visita externa (HU-01) |
| POST | `/visits/verify-code` | Verificar código y listar integrantes (HU-03) |
| GET | `/visits/funcionario/:cedula` | Consultar funcionario y acompañantes |
| POST | `/visits/funcionario` | Registrar ingreso de funcionario |
| POST | `/movements/exit` | Salida temporal o definitiva (HU-04) |
| POST | `/movements/re-entry` | Reingreso tras salida temporal (HU-05) |
| PATCH | `/movements/confirm-definitive-exit` | Cierre definitivo por visitante (HU-06) |

### Autenticados (JWT)

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| POST | `/auth/login` | — | Login y token JWT (HU-02) |
| GET | `/guard/active-visits` | Vigilante/Admin | Visitas activas (HU-07) |
| GET | `/guard/search?query=` | Vigilante/Admin | Búsqueda por código, cédula, placa |
| PATCH | `/movements/confirm-definitive-exit/guard` | Vigilante/Admin | Cierre asistido con observación |
| GET | `/admin/audit-logs` | Admin | Historial de movimientos (HU-08) |
| CRUD | `/admin/users`, `/admin/areas` | Admin | Gestión de usuarios y áreas |

## Ejemplo: registrar visitante

```bash
curl -X POST http://localhost:3000/api/v1/visits/visitor ^
  -H "Content-Type: application/json" ^
  -d "{\"nombre_completo\":\"Carlos López\",\"cedula\":\"1234567890\",\"telefono\":\"3001112233\",\"contacto_emergencia\":\"Ana López 3009998877\",\"area_id\":1,\"motivo_visita\":\"Reunión comercial\",\"ingresa_vehiculo\":true,\"placa_vehiculo\":\"ABC123\",\"acompanantes\":[{\"nombre_completo\":\"Laura López\",\"cedula\":\"0987654321\"}]}"
```

Respuesta incluye `codigo_visita` (ej. `VA-583921`) para mostrar al visitante.

## Ejemplo: login vigilante

```bash
curl -X POST http://localhost:3000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"vigilante@mastersolution.com\",\"password\":\"Vigilante123!\"}"
```

Usar el token en cabecera: `Authorization: Bearer <token>`

## Estructura del proyecto

```
visitapp-backend/
├── data/                  # Base SQLite (generada al ejecutar)
├── src/
│   ├── config/            # Variables de entorno
│   ├── database/          # Schema, init, seed
│   ├── controllers/       # Controladores HTTP
│   ├── middleware/        # Auth JWT, validación, errores
│   ├── routes/            # Rutas API v1
│   ├── services/          # Lógica de negocio
│   ├── utils/             # Códigos y estado de visitas
│   ├── app.js
│   └── server.js
├── .env.example
└── package.json
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm start` | Inicia el servidor |
| `npm run dev` | Inicia con recarga automática (Node --watch) |
| `npm run db:init` | Solo crea/actualiza tablas |
| `npm run db:seed` | Inserta datos de prueba |

## Notas técnicas

- La base de datos SQLite vive en el proyecto (`data/visitapp.db`); no requiere PostgreSQL ni servidor externo.
- Transacciones ACID con **node:sqlite** (SQLite integrado en Node.js 22+) para creación de visitas y movimientos.
- Contraseñas con **bcrypt**; tokens **JWT** con vigencia de 8 horas.
- Validaciones con **Zod** en todos los endpoints de entrada.
