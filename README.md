# GTLT — Gestión Tambera Lobeto Tambos

SaaS multitenant offline-first para tambos chicos (~20 bajadas) en Argentina. Versión mobile (Expo + WatermelonDB) y web dashboard para desarrolladores.

## 🚀 Inicio rápido (desarrollo local)

### Requisitos
- Node.js 24 LTS
- PostgreSQL 15+ (ejecutándose en localhost:5432)
- npm 10+

### 1. Clonar y preparar

```bash
git clone <repo>
cd gtlt
```

### 2. Configurar Base de Datos

```bash
# En pgAdmin o terminal
createdb gtlt
psql -U postgres -d gtlt -c "CREATE ROLE postgres SUPERUSER LOGIN;"
```

Conexión default: `postgres://postgres:7754@localhost:5432/gtlt`

### 3. Instalar y ejecutar API

```bash
cd apps/api

# Instalar deps
npm install

# Generar Prisma client
npx prisma generate

# Aplicar migraciones
npx prisma migrate dev

# Seed con usuarios demo
npx prisma db seed

# Iniciar servidor (puerto 3001)
npm run dev
```

**Demo usuarios:**
- `admin@gtlt.local` / `demo1234` (roles: DUENIO, ADMIN)
- `tambero@gtlt.local` / `demo1234` (role: TAMBERO)
- `tecnico@gtlt.local` / `demo1234` (role: TECNICO)

### 4. Instalar y ejecutar Web Dashboard

```bash
cd apps/web

# Instalar deps
npm install

# Iniciar dev server (puerto 5173)
npm run dev
```

Acceso: http://localhost:5173  
Credenciales demo: admin@gtlt.local / demo1234

### 5. (Opcional) Mobile Spike

```bash
cd apps/mobile

npm install
npm start  # Expo dev client
```

## 📁 Estructura del Proyecto

```
gtlt/
├── docs/
│   ├── arquitectura.md              ← Documento canónico de sistema
│   ├── reglas-negocio-app.md        ← Validaciones de negocio
│   ├── vision-producto-tambo.md     ← ICP, fases, diferenciadores
│   ├── diseno.md                    ← UX, colores, tipografía
│   ├── erd.md                       ← Diagrama entidad-relación
│   └── ...
│
├── apps/
│   ├── api/                         ← Express + Prisma + JWT
│   │   ├── src/
│   │   │   ├── app.ts               ← Factory de Express app
│   │   │   ├── index.ts             ← Entry point (puerto 3001)
│   │   │   ├── routes/              ← Endpoints REST
│   │   │   ├── middleware/          ← Auth, guards, etc.
│   │   │   └── lib/                 ← Helpers (Prisma, JWT, etc)
│   │   ├── prisma/
│   │   │   ├── schema.prisma        ← Modelo de datos (fuente de verdad)
│   │   │   ├── seed.ts              ← Script de demo data
│   │   │   └── migrations/          ← Historial de cambios DB
│   │   └── package.json
│   │
│   ├── web/                         ← React + TypeScript + Tailwind + Vite
│   │   ├── src/
│   │   │   ├── App.tsx              ← Punto entrada (login → dashboard)
│   │   │   ├── pages/
│   │   │   │   ├── LoginPage.tsx    ← Formulario de login
│   │   │   │   └── DashboardPage.tsx ← Tabs: tickets + prototype config
│   │   │   ├── components/
│   │   │   │   ├── TicketsTab.tsx   ← Gestión de tickets
│   │   │   │   └── PrototypeTab.tsx ← Gestión de versiones
│   │   │   ├── types/               ← TypeScript interfaces
│   │   │   └── lib/api.ts           ← Cliente HTTP
│   │   ├── README.md                ← Guía del dashboard
│   │   └── package.json
│   │
│   └── mobile/                      ← React Native + Expo (spike)
│       └── README.md
│
└── README.md (este archivo)
```

## 🔑 Autenticación

- **JWT:** tokens creados en `POST /auth/login` (apps/api/src/routes/auth.ts)
- **Claims:** `sub` (userId), `tenantId`, `roles[]`, `tamboIds` (null = acceso a todos)
- **Almacenamiento mobile:** Secure Storage (react-native-secure-storage)
- **Almacenamiento web:** localStorage (clave: `gtlt_auth`)
- **Scope:** todas las queries usan `tenantId` del token para multitenant

## 📊 Modelo de Datos

**Fuente de verdad:** `apps/api/prisma/schema.prisma`

Entidades principales:
- **User:** email, password (hashed), name
- **Tenant:** workspace del cliente (ej. "Tambo García S.A.")
- **Tambo:** sucursal dentro del tenant
- **Membership:** relación User ↔ Tenant con roles
- **MembershipTambo:** permisos de Usuario en Tambo específico
- **Animal:** bovino con caravana visual/electrónica
- **MilkingSession:** ordeñe (offline-first, append-only con VOIDED + corrects*Id)
- **FlowSession / FlowPulse:** datos del caudalímetro (flow meter)
- **SupportTicket:** consultas de usuario (dashboard de soporte)
- **AppPrototypeConfig:** versiones del prototipo (links, notas internas)

**Patrones:**
- **Append-only:** MilkingSession, HealthEvent, ReproEvent never update; use VOIDED + corrects*Id
- **Multitenant:** todas las queries filtran por tenantId
- **LWW (Last-Write-Wins):** Animal fiches permiten update (no append-only)

## 🛣️ Roadmap

| Fase | Descripción | Estado |
|---|---|---|
| 1 | Modelo de datos + API mínima + mobile MVP | ✅ Parcial |
| 1.5 | Dashboard interno (tickets + prototype config) | ✅ **HECHO** |
| 2 | Integración caudalímetro (flow meter) | ✅ Parcial |
| 2 | Web dueño (resumen, alertas) | ⏳ Planeado |
| 3 | Módulo de costos (precios/insumos) | ⏳ Planeado |
| 4 | Veterinario + servicios reproductivos | ⏳ Planeado |

## 🗂️ Documentación

- **[arquitectura.md](./docs/arquitectura.md)** — Documento canónico: stack, modelos, decisiones
- **[reglas-negocio-app.md](./docs/reglas-negocio-app.md)** — Validaciones de negocio por entidad
- **[vision-producto-tambo.md](./docs/vision-producto-tambo.md)** — ICP, fases de producto
- **[diseno.md](./docs/diseno.md)** — UX, colores (blanco/verde/amarillo), tipografía
- **[erd.md](./docs/erd.md)** — Diagrama entidad-relación
- **[apps/web/README.md](./apps/web/README.md)** — Guía del dashboard React

## 🔧 Comandos Útiles

### API
```bash
cd apps/api

npm run dev              # Iniciar dev server (hot reload)
npm run build            # TypeScript check + build
npm run db:migrate       # Aplicar migraciones
npm run db:seed          # Cargar usuarios demo
npx prisma studio       # GUI de Prisma (http://localhost:5555)
npx prisma migrate dev  # Crear + aplicar migraciones
```

### Web
```bash
cd apps/web

npm run dev              # Iniciar Vite dev (http://localhost:5173)
npm run build            # Build de producción (dist/)
npm run preview          # Previsualizar build local
npm run lint             # Ejecutar linter (si está configurado)
```

### Mobile
```bash
cd apps/mobile

npm start                # Expo dev client
npm run build            # Build APK/IPA
```

## 🐛 Troubleshooting

### PostgreSQL no conecta
```bash
# Windows: iniciar servicio
net start postgresql-x64-15

# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### Prisma EPERM en Windows
```bash
# Si genera error en .prisma/
rm -r node_modules/.prisma node_modules/@prisma
npm install --no-fund --no-audit
```

### "usuario no existe" en seed
```bash
npx prisma db push      # Sincronizar schema con DB
npx prisma db seed      # Reintentar seed
```

### CORS error desde web
Asegurar que `apps/api/src/app.ts` tiene `cors()` en línea 1:
```typescript
app.use(cors());
```

## 📝 Convenciones

- **Español en UI:** botones, errores, estados siempre en español
- **Nombres variables:** camelCase en código
- **Archivos:** kebab-case para rutas (`support-tickets.ts`), PascalCase para componentes React
- **Commits:** prefijo tipo (feat:, fix:, docs:, chore:) + descripción en español
- **SQL:** comentarios en español, indentación de 2 espacios

## 👥 Team & Contacto

- **Desarrollador:** Mercedez
- **PM:** Lobeto Tambos
- **Repo:** Este (privado)

## 📄 Licencia

Privado — uso interno Lobeto Tambos.
