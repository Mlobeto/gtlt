# GTLT — Arquitectura y documentación técnica

**Producto:** GTLT (Gestión Tambera Lobeto Tambos)  
**Estado:** Fase 1 — modelo de datos migrado en local; API/apps aún no implementadas  
**Última actualización:** 2026-08-08  

Este es el **documento canónico** de arquitectura. Cuando una decisión cambie, se actualiza acá y, si aplica, en los docs satélite enlazados abajo.

| Documento | Contenido |
|---|---|
| [vision-producto-tambo.md](./vision-producto-tambo.md) | ICP, fases de producto, diferenciadores |
| [diseno.md](./diseno.md) | Colores, tipografía, formularios (blanco / verde / amarillo) |
| [erd.md](./erd.md) | ERD detallado (campos, relaciones, índices) |
| [reglas-negocio-app.md](./reglas-negocio-app.md) | Validaciones que viven en la API, no en la DB |
| [partial-indexes.sql](./partial-indexes.sql) | SQL de unicidades parciales (referencia) |
| `apps/api/prisma/schema.prisma` | Schema Prisma (fuente de verdad del modelo) |
| `apps/api/prisma/migrations/` | Migraciones aplicadas |

---

## 1. Qué es y para quién

SaaS multitenant para **tambos chicos** (hasta ~20 bajadas, no robotizados) en Argentina. Canal y marca: Lobeto Tambos.

**Dolor central del MVP:** cargar datos en el momento del ordeñe, con las manos ocupadas y **sin conexión**, identificando animales por **caravana visual** (sin RFID).

Roles: **tambero**, **dueño**, **admin**, **veterinario**.

### UX e idioma (regla de producto — no negociable)

- **Solo español** en toda UI visible al usuario final (mobile y web). Sin inglés en botones, errores ni estados.
- Pensado para personas con **poca familiaridad con apps**: pocas pantallas, textos cortos, verbos claros (“Guardar”, “Enviar”, “Sin internet”).
- Evitar jerga técnica: no mostrar sync/pending/API/token/offline en inglés; preferir “Sin señal”, “Guardado en el teléfono”, “Falta enviar”, “Listo”.
- Botones grandes, un trabajo por pantalla, confirmaciones simples.
- Errores en español llano (“No se pudo conectar. Revisá el Wi‑Fi o los datos.”).
- Detalle: [ux-usuario.md](./ux-usuario.md).

---

## 2. Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Runtime | Node.js **24 LTS** | Instalación directa desde nodejs.org (sin nvm) |
| API | Node.js (a implementar) | |
| ORM / DB | **Prisma 6** + **PostgreSQL** | `url` en `schema.prisma` es válido en v6; el warning del editor Prisma 7 se ignora |
| Web | React + Redux + Tailwind | Aún no scaffold |
| Mobile | React Native + Expo | Offline-first; aún no scaffold |
| DB local mobile | WatermelonDB (primera opción) | Sin Prisma en el cliente |
| Repo | Monorepo previsto `apps/{api,web,mobile}` + `packages/shared` | Hoy existe `apps/api` |

**DB local de desarrollo:** PostgreSQL en localhost, database `gtlt`.  
Connection string en `apps/api/.env` (no versionar). Plantilla: `apps/api/.env.example`.

---

## 3. Principios

1. **Offline en el punto de carga es no negociable.**
2. **Eventos append-only** por defecto; LWW solo en fichas editables (`Animal`).
3. **Caravana visual** por tambo; RFID queda como campo futuro nullable.
4. **Muchos tenants chicos** → shared DB, no schema-per-tenant.
5. **Extensibilidad:** sensores (Fase 2) y costos (Fase 3) enganchan sobre entidades de Fase 1.
6. **Trazabilidad:** todo evento registra `createdById` (varios dispositivos en sala es el caso normal).

---

## 4. Multitenancy (cerrado)

### Modelo organizacional

```
Tenant          ← unidad de aislamiento de datos y facturación
  └── Tambo[]   ← establecimiento físico (1 o varios por tenant)
```

No hay capa `Organization` separada.

### Persistencia

- **Shared database + shared schema** + `tenant_id` en entidades de negocio.
- Entidades operativas llevan **`tenant_id` y `tambo_id`**.
- Aislamiento en capa de aplicación (scope Prisma / middleware). **RLS** de Postgres: refuerzo posterior, no Fase 1.
- Índices compuestos `(tenant_id, tambo_id, …)` en queries calientes.

### Acceso a tambos por rol

| Roles en el Membership | Alcance de tambos |
|---|---|
| Incluye `DUENIO` o `ADMIN` | Todos los tambos del tenant |
| Solo `TAMBERO` / `VETERINARIO` | Lista en `MembershipTambo` |

- Un `Membership` puede tener **varios roles** (`Role[]`).
- El alcance de tambos es **a nivel Membership**, no por rol individual.
- Caso “tambero en Tambo A y vet en Tambo B” **fuera de Fase 1**.

---

## 5. Offline-first (cerrado)

### Spike implementado (`apps/mobile`)

- Expo + **expo-sqlite** (no WatermelonDB todavía — validar protocolo primero)
- Outbox local → `POST /health-events` con UUID/`clientMutationId`
- Cache local de animales + retiros vigentes (`active-withdrawals`)
- UI mínima: login, guardar tratamiento local, Sync push/pull
- Ver `apps/mobile/README.md`

### Enfoque

```
UI (voz/teclado) → SQLite local → outbox
       ↓ (con red)
Push idempotente (client_mutation_id / UUID)
Pull por cursor (updated_at)
       ↓
PostgreSQL = fuente de verdad (web / dueño / vet)
```

- UUID generados en el cliente.
- Cache local no es solo outbox: incluye **retiros de leche vigentes** e historial reciente (sanidad).
- Multi-dispositivo concurrente por tambo (2–3 personas) sin merge complejo: eventos append-only.

### Conflictos

| Tipo | Estrategia |
|---|---|
| Eventos (`MilkingSession`, `HealthEvent`, `ReproEvent`, `MilkDelivery`, `ControlLechero`, …) | Append-only; corrección = `VOIDED` + fila nueva `ACTIVE` con `corrects*Id` |
| Ficha `Animal` | Last-Write-Wins (`updatedAt` / `version`) |
| Config / memberships | Principalmente online; pull en mobile |

Detalle de corrección: ver §6 y [reglas-negocio-app.md](./reglas-negocio-app.md).

---

## 6. Modelo de datos Fase 1 (resumen)

Fuente de verdad: `apps/api/prisma/schema.prisma`. Detalle de campos: [erd.md](./erd.md).

### Identidad y acceso

- `User` — identidad global  
- `Membership` — user ↔ tenant + `roles[]`  
- `MembershipTambo` — alcance operativo de tambos  
- `Tenant` / `Tambo` (`bajadaCount` alimenta fórmula de uso de piezas)

### Animales

- `Animal` — ficha; `earTag` visual; `photoUrl` (URL storage TBD); `tamboId` **mutable**  
- Unicidad: `(tambo_id, ear_tag)` entre `ACTIVE`/`DRY` (índice parcial)  
- `AnimalTransferEvent` — historial append-only de cambio de tambo dentro del tenant  
- Eventos históricos **conservan** el `tambo_id` del momento de carga

### Producción (tres entidades separadas)

1. **`MilkingSession`** — litros **totales del turno** (mañana/tarde) por tambo/día. Carga principal del tambero. Sin desagregar por animal/bajada (hace falta caudalímetro).  
   Corrección: `status` + `correctsSessionId`. Unique parcial: un `ACTIVE` por `(tambo, fecha, turno)`.

2. **`ControlLechero` + `ControlLecheroLine`** — control periódico (~6 meses), litros **por animal / por bajada**. Fuente `EXTERNAL_TECHNICIAN` ahora; `FLOW_METER` futuro.  
   Corrección a nivel header (`status` + `correctsControlId`); las líneas no se editan solas.

3. **`MilkDelivery`** — reconciliación tanque frío vs camión + temperaturas (`coldTankTemperatureC`, `truckTemperatureC`) para plus por temperatura.  
   Corrección: `status` + `correctsDeliveryId`. Índice en `coldEquipmentInstanceId`.

### Eventos por animal

- **`HealthEvent`** — mastitis, tratamientos, `milkWithdrawalUntil` (crítico offline)  
- **`ReproEvent`** — celo, servicio, parto estimado, etc.

### Mantenimiento de equipo

Reemplaza el stub vacío `MilkingEquipment`:

- **`PartType`** — catálogo **global** (`USAGE_BASED` | `REACTIVE` | `BRANDED`)  
- **`TenantPartTypeConfig`** — override de umbral de uso por tenant  
- **`PartInstance`** — pieza instalada; `bajadaNumber` nullable; `photoUrl`; `usageCounter` calculado  
- **`ColdEquipmentDetail`** — 1:1 con instancia BRANDED (marca, modelo, capacidad, controlador EKC)

**Grupo de ordeñe (lógico):** por bajada, hasta 4 instancias vigentes (centralizador, copas, pezoneras, tubos cortos).

**Unicidad de vigencia** (dos índices parciales — Postgres `NULL != NULL`):

- Por bajada: `(tambo, part_type, bajada_number) WHERE replaced_at IS NULL AND bajada_number IS NOT NULL`  
- Nivel tambo: `(tambo, part_type) WHERE replaced_at IS NULL AND bajada_number IS NULL`

Fórmula `usageCounter` y reglas de `bajadaNumber`: comentarios en schema + [reglas-negocio-app.md](./reglas-negocio-app.md).

### Ganchos fases futuras (no implementados)

| Fase | Enganche |
|---|---|
| 2 — Sensores | `Sensor` / `SensorReading` → `Tambo` y/o `PartInstance` (vacuómetro, bomba, EKC 202) |
| 2 — Caudalímetro | `ControlLechero.source = FLOW_METER` |
| 3 — Costos | Tablas de precios/insumos que **referencian** sesiones, health events, deliveries |
| RFID | `Animal.electronicId` |

---

## 7. Autenticación y permisos (mínimo implementado)

**Ubicación:** `apps/api/src/`

| Pieza | Detalle |
|---|---|
| Login | `POST /auth/login` `{ email, password, tenantId? }` → JWT |
| JWT claims | `sub` (userId), `tenantId`, `roles[]`, `tamboIds` (`null` = todos) |
| Me | `GET /auth/me` — user, tenant, tambos visibles |
| Scope | Queries de negocio usan siempre `tenantId` del token; tambos filtrados si `tamboIds` no es null |
| Roles helper | `requireRoles(...)` para endpoints futuros |

**Demo local** (seed): `admin@gtlt.local` / `demo1234` (roles `DUENIO`+`ADMIN`, 1 tambo).

Pendiente: refresh tokens, invite vet, matriz fina por endpoint, revalidación de rol en sync push.

---

## 8. Estructura del repositorio

```
gtlt/
  apps/
    api/                 # Express + Prisma + JWT  ← auth mínima
      src/
        index.ts
        app.ts
        routes/
        middleware/
        lib/
      prisma/
        schema.prisma
        seed.ts
        migrations/
      .env               # local, gitignored
      .env.example
    web/                 # previsto
    mobile/              # spike offline Expo + SQLite/outbox
  packages/
    shared/              # previsto: zod, enums, tipos de sync
  docs/                  # arquitectura y producto
```

**Compartir** en `packages/shared`: enums, schemas Zod de sync/DTOs, reglas puras (ej. “¿está en retiro?”).  
**No compartir:** Prisma Client (solo api), UI, schema WatermelonDB (solo mobile).

---

## 9. Estado de implementación (hecho / no hecho)

### Hecho

- [x] Decisiones de arquitectura cerradas y documentadas  
- [x] ERD + schema Prisma Fase 1  
- [x] Migración inicial aplicada en DB local `gtlt` (incluye índices parciales)  
- [x] Índice simple `milk_deliveries.cold_equipment_instance_id`  
- [x] Repo GitHub: `https://github.com/Mlobeto/gtlt`  
- [x] Node 24 LTS + deps de `apps/api` instaladas  
- [x] Seed de `PartType` (`apps/api/prisma/seed.ts`, idempotente por `code`)  
- [x] API mínima Express + JWT + scope tenant/tambo (`npm run dev` en `apps/api`)  
- [x] Seed demo user/tenant (`admin@gtlt.local` / `demo1234`)  
- [x] Endpoint negocio `MilkingSession`: `GET/POST /milking-sessions`, `POST /milking-sessions/:id/correct`  
- [x] Endpoints `Animal` + `HealthEvent` (incl. `GET /health-events/active-withdrawals` para cache offline)  
- [x] Spike offline mobile (`apps/mobile`): Expo **SDK 54** + `expo-sqlite` + outbox + push `HealthEvent` (alineado a Expo Go de tienda)  

### Pendiente (próximos pasos naturales)

- [ ] App web dueño  
- [ ] Endurecer mobile (WatermelonDB o sync protocol v1, voz, UX ordeñe)  
- [ ] Definir proveedor de storage para `photoUrl`  
- [ ] RLS Postgres (post-MVP datos reales)  

---

## 10. Operación local (API / DB)

```powershell
cd C:\Users\merce\Desktop\gtlt\apps\api
# .env: DATABASE_URL + JWT_SECRET
npx prisma migrate dev
npm run prisma:seed
npm run dev
# http://localhost:3001/health
# POST /auth/login  { "email":"admin@gtlt.local", "password":"demo1234" }
```

Índices parciales viven **dentro** de la migración `20260809003221_init` (también documentados en `partial-indexes.sql` como referencia).

**Prisma:** proyecto en **v6**. No migrar a Prisma 7 hasta decidir conscientemente (`prisma.config.ts`, adapters).

---

## 11. Decisiones descartadas (para no reabrir sin motivo)

| Alternativa | Por qué no |
|---|---|
| Schema/DB per tenant | Costo operativo con cientos de tambos chicos |
| Organization encima de Tenant | Simplificado: Tenant = cuenta; Tambo = establecimiento |
| Prisma en mobile | No es el tool para SQLite/RN |
| Redux Persist / AsyncStorage como DB offline | No escala a historial |
| Edición in-place de sesiones/entregas/controles | Rompe append-only; se usa VOIDED + corrección |
| Unicidad de caravana a nivel tenant | Cada tambo tiene su numeración |
| Alcance de tambo por rol individual | Fuera de Fase 1 |

---

## 12. Cómo mantener este documento

1. Toda decisión de arquitectura nueva o cambio de modelo se refleja **acá** el mismo día.  
2. Cambios de campos/índices → actualizar `schema.prisma` + [erd.md](./erd.md) (+ migración).  
3. Reglas que no entren en SQL → [reglas-negocio-app.md](./reglas-negocio-app.md).  
4. Visión de producto / alcance de fases → [vision-producto-tambo.md](./vision-producto-tambo.md).  
5. No duplicar el schema completo en este archivo; enlazar.
