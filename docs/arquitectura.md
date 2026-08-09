# Arquitectura GTLT — Documento de decisiones

**Producto:** GTLT (Gestión Tambera Lobeto Tambos)  
**Estado:** Diseño de arquitectura (pre-implementación)  
**Stack fijado:** Node.js · Prisma · PostgreSQL · React + Redux + Tailwind · React Native (Expo)  
**Fecha:** 2026-08-08  

Este documento registra decisiones propuestas, alternativas descartadas y preguntas abiertas. No incluye schema Prisma ni código de producción.

---

## 0. Principios de diseño (derivados del dominio)

1. **Offline en el punto de carga es no negociable.** El tambero carga en el ordeñe; la sync es un detalle de infraestructura, no un requisito del flujo de UX.
2. **La mayoría de escrituras son eventos append-only**, no ediciones concurrentes del mismo registro. Eso simplifica conflictos.
3. **Identidad animal = número de caravana visual por tenant**, sin RFID todavía. Unicidad y UX de búsqueda deben asumir tipado/voz + desambiguación.
4. **Multitenancy de muchos tenants chicos** (cientos de tambos), no pocos tenants grandes.
5. **Extensibilidad sin rediseño:** equipo de ordeñe (Fase 2) y costos (Fase 3) enganchan sobre entidades de Fase 1, no al revés.

---

## 1. Estrategia de multitenancy sobre PostgreSQL

### Decisión propuesta

**Shared database + shared schema + `tenant_id` en todas las tablas de negocio**, con aislamiento enforced en la capa de aplicación (middleware Prisma / query scope) y, como refuerzo opcional en producción, **Row Level Security (RLS)** en Postgres.

- Un solo pool de conexiones, un solo migration set (Prisma).
- Cada fila de negocio lleva `tenant_id` (UUID).
- Índices compuestos `(tenant_id, …)` en las consultas calientes (animal por caravana, producción por fecha, etc.).
- El contexto de request siempre resuelve `tenantId` activo (JWT / session claim) y el data access lo inyecta — nunca confiar en el cliente para filtrar.

### Por qué encaja este caso

| Factor | Impacto |
|---|---|
| Cientos de tambos chicos | Schema-per-tenant o DB-per-tenant explota en costo operativo (migrations × N, connection slots, backups). |
| Volumen por tenant bajo | Un tambo ≤20 bajadas no justifica aislamiento físico; el ruido de vecinos en índices compartidos es manejable. |
| Sync offline | Un solo modelo de tablas → un solo protocolo de sync (pull/push por `tenant_id` + cursor). Schema-per-tenant complica el endpoint de sync y el client schema. |
| Experiencia previa (GestionProp) | Mismo patrón mental; menos riesgo de aprendizaje en la pieza menos crítica (el riesgo está en offline). |

### Alternativas consideradas

| Opción | Ventajas | Por qué la descartamos (ahora) |
|---|---|---|
| **Schema-per-tenant** | Aislamiento fuerte; restore selectivo más limpio | Con cientos de tambos: `prisma migrate` / DDL por schema es pesado; pool de conexiones con `search_path` es frágil; sync offline tiene que conocer N schemas o unificar de todos modos. Overkill para datos no sensibles a nivel bancario. |
| **Database-per-tenant** | Aislamiento máximo | Inviable operativamente a esta escala y precio SaaS para tambos chicos. |
| **Shared DB sin `tenant_id` tipado (solo filtros ad-hoc)** | Más rápido de prototipar | Filtrados incompletos = data leak; no aceptable. |
| **RLS como única barrera (sin scope en app)** | Defensa en profundidad atractiva | Prisma + RLS requiere cuidado con el `SET LOCAL` del `tenant_id` por transacción; útil como **refuerzo**, no como único mecanismo en Fase 1. |

### Impacto en sync offline

- El cliente móvil solo materializa **un tenant a la vez** (o un set pequeño si el usuario tiene varios tambos, pero la sesión de ordeñe es de un tambo).
- El servidor filtra pull/push por `tenant_id` del token → el modelo shared-schema es el más simple para WatermelonDB / SQLite local.
- No hace falta versionar schemas distintos por tenant.

### Refuerzo recomendado (no bloqueante para empezar)

1. Fase 1: scope obligatorio en repositorio/Prisma middleware. Tests de “nunca cruce de tenant”.
2. Cuando haya datos reales de clientes: evaluar RLS con policy `tenant_id = current_setting('app.tenant_id')::uuid` y setearlo al inicio de cada request/transacción.

### Preguntas abiertas (vos)

- ¿Un “tenant” es siempre **un tambo físico**, o un dueño con 2–3 tambos es un solo tenant con N establecimientos? (Esto cambia si `tenant_id` = organización o = tambo. Ver §3 y §4.)
- ¿Hay requisito legal/contractual de aislamiento físico de datos entre clientes? (Si sí, reabrimos schema/DB-per-tenant para un subconjunto.)

---

## 2. Estrategia offline-first (móvil) — pieza crítica

### Decisión propuesta

**SQLite local en el dispositivo + motor de sync con cola de mutaciones (outbox), orientado a eventos.**  
Stack concreto recomendado para Expo/RN:

| Capa | Elección | Motivo |
|---|---|---|
| DB local | **WatermelonDB** (SQLite debajo) o **expo-sqlite / op-sqlite + capa propia** | WatermelonDB trae observabilidad reactiva + sync protocol mental; expo-sqlite es más liviano pero hay que construir más. |
| Fuente de verdad servidor | PostgreSQL vía API Node (Prisma) | Sin cambio al stack servidor. |
| Protocolo | **Pull por cursor (`updated_at` / `server_version`) + Push de mutaciones idempotentes** | Encaja con eventos append-only. |
| Identidad de filas | **UUID generados en el cliente** (`id` estable offline) | Evita choques al sincronizar inserts. |
| Conflictos | **Last-write-wins solo en entidades “ficha”**; **append-only sin merge** en eventos | Ver matriz abajo. |

**No usar Prisma en el cliente.** Prisma es server-ORM; no resuelve SQLite embebido en RN de forma adecuada para este caso.

### Modelo mental de sync

```
[Ordeñe / sin red]
  UI (voz / teclado) → escribe SQLite local → marca pending en outbox
       ↓ (cuando hay red)
  Push: outbox → API /sync/push (idempotent por mutation_id)
  Pull: API /sync/pull?since=cursor → aplica cambios remotos al SQLite
       ↓
  Servidor Postgres = fuente de verdad para dueño/web/vet
```

### Matriz de conflictos (dominio)

| Tipo de dato | Ejemplo | Estrategia |
|---|---|---|
| **Evento (append)** | producción, mastitis, celo, tratamiento | Insert idempotente por `client_mutation_id` / UUID. Casi no hay “conflicto”: coexisten. |
| **Ficha animal** | alta, baja, cambio de estado, caravana | LWW por `updated_at` + `version`; o “el servidor gana” si hay edición admin remota. UI avisa si se pisó un cambio local raro. |
| **Config tenant** | roles, parámetros | Solo online / admin; no se edita en ordeñe. Pull-only en móvil. |
| **Retiro de leche** | derivado de evento sanitario | Campo calculado o denormalizado al crear el evento; no se edita concurrentemente. |

La hipótesis fuerte: **en el momento del ordeñe casi no hay dos escritores sobre la misma fila**. Dos tamberos cargando a la vez es edge case; si existe, preferimos dos eventos de producción (ambos válidos) antes que un merge sofisticado tipo CRDT.

### Alternativas concretas

| Opción | Pros | Contras / por qué no (o cuándo sí) |
|---|---|---|
| **WatermelonDB** | Hecho para RN offline; sync pulls/pushes; observables | Curva de aprendizaje; schema duplicado (local vs Prisma); comunidad más chica que SQLite crudo. **Candidato principal.** |
| **SQLite (expo-sqlite / op-sqlite) + outbox propia** | Control total; menos magia | Hay que diseñar sync, migraciones locales y queries reactivas. Viable si WatermelonDB molesta con Expo. |
| **PowerSync / ElectricSQL / similar** | Sync “mágico” Postgres↔SQLite | Costo, acoplamiento, y a menudo asumen RLS/Postgres patterns específicos; evaluar solo si querés pagar por no construir sync. **No Fase 1 salvo que el time-to-market lo justifique.** |
| **Redux Persist / AsyncStorage como “DB”** | Simple | No escala a historial sanitario/reproductivo; queries pobres. Descartado. |
| **Cola solo en memoria / “reintentar POST”** | Rápido de demo | Pierde datos si mata la app; no es offline-first real. Descartado. |
| **Prisma en cliente** | “Un solo ORM” | No es el tool correcto en RN/SQLite. Descartado. |

### Implicaciones de diseño (desde ya)

1. **Todos los inserts de negocio llevan UUID de cliente** y `created_at` local (ISO UTC).
2. Tabla/cola `sync_mutation` (local): `{ mutation_id, entity, payload, created_at, status }`.
3. Servidor expone endpoints de sync **por tenant**, no CRUD fragmentado como único camino offline (el CRUD online del dueño/web puede coexistir).
4. **Prod/web puede ser online-first** (dueño remoto con conexión). Mobile tambero = offline-first. No hace falta que Redux web replique SQLite.
5. **Carga por voz** escribe al mismo repositorio local que el teclado — la voz es input UI, no otro pipeline de datos.

### Riesgos técnicos (explícitos)

- **Duplicar schema** local vs Prisma: mitigar con paquete compartido de tipos/zod y generadores, o tests de contrato.
- **Relojes desfasados** del celular: usar `server_created_at` al aceptar; ordenar UI de ordeñe por secuencia local de sesión.
- **Caravana mal tipeada offline**: no se puede validar contra “todo el rodeo” si el pull está viejo — mitigar cacheando el padrón de animales del tenant en cada sync exitoso (dataset chico: decenas/cientos de animales, no millones).

### Preguntas abiertas (vos — críticas)

- En entrevistas: ¿cuánto tiempo típico **sin señal** durante el ordeñe? ¿horas, toda la mañana, días?
- ¿Un solo dispositivo carga en el ordeñe, o pueden ser dos personas/celulares a la vez?
- ¿El tambero necesita **consultar historial** offline (últimos tratamientos / retiro de leche) o solo **cargar**?
- ¿La voz corre 100% on-device o tolerás cloud speech cuando hay red? (Impacta arquitectura de input, no tanto de sync.)

---

## 3. Modelo de datos inicial (Fase 1) — conceptual

> Sin schema Prisma. Solo entidades, claves, relaciones y ganchos a fases futuras.

### 3.1 Tenant y estructura organizacional

**Propuesta A (recomendada para empezar):**  
`Organization` (cuenta de facturación / dueño) 1—N `Tenant` (tambo / establecimiento).  
Roles y datos operativos cuelgan del **Tenant** (el tambo).  
El dueño con 3 tambos = 1 org, 3 tenants; elige “tambo activo” en la app.

Si en entrevistas confirmás que casi nadie tiene más de un tambo, se puede colapsar a un solo nivel `Tenant` y agregar `Organization` después — pero el costo de ponerlo ahora es bajo y evita migraciones dolorosas.

Campos mínimos Tenant: `id`, `organization_id`, `name`, `timezone` (America/Argentina/…), `settings` (json), timestamps.

### 3.2 Usuario y membresía

- `User`: identidad global (email/phone, auth).
- `Membership`: `(user_id, tenant_id, role)` — roles: `tambero` | `duenio` | `admin` | `veterinario`.
- Un user puede tener N memberships (dueño multi-tambo; vet que visita varios).
- En tambos chicos, la misma persona puede tener `duenio` + `admin` (dos memberships o un rol compuesto — preferible **un rol primario** + flags, o simplemente dos roles si el modelo lo permite; ver pregunta abierta).

### 3.3 Animal

- `Animal`: `id` (UUID), `tenant_id`, `ear_tag` (número/código visual), `status` (activa, seca, vendida, muerte, …), fechas relevantes (nacimiento, ingreso), notas.
- **Unicidad:** `(tenant_id, ear_tag)` entre animales activos (definir si se reutiliza caravana tras baja — pregunta abierta).
- Sin RFID ahora; campo nullable futuro `electronic_id` / `rfid` no hace daño.
- Soft facts para costos Fase 3: mantener eventos de baja/venta con fecha (no borrar historia).

### 3.4 Registro de producción

Pensar en **sesión de ordeñe** + **líneas**:

- `MilkingSession`: `tenant_id`, `started_at`, `ended_at`, `shift`/`number` (1ª/2ª bajada del día), `created_by`, `equipment_id` (nullable FK → Equipo), `source` (`manual` | `meter` futuro).
- `ProductionRecord`: `session_id`, `animal_id` (nullable si a veces solo hay total), `liters`, `notes`, `client_mutation_id`, timestamps.

Si en MVP a veces solo cargan **total del turno** sin desglose por animal, soportar `ProductionRecord` a nivel sesión con `animal_id = null` **o** un campo `session.total_liters`. Preferible: líneas por animal cuando se pueda + total de sesión opcional/derivado.

**Gancho Fase 2/3:** `source`, `equipment_id`, y más adelante lecturas de caudalímetro como series temporales ligadas a `equipment_id` / `session_id`.

### 3.5 Evento sanitario

- `HealthEvent`: `tenant_id`, `animal_id`, `type` (mastitis, tratamiento, otro), `diagnosed_at`, `product`/`drug` (texto o catálogo chico), `milk_withdrawal_until` (fecha/hora fin de retiro), `notes`, `created_by`, `client_mutation_id`.
- El **período de retiro** es un campo de primer nivel (no enterrado en notes): el dueño y el tambero offline necesitan filtrar “no entregar leche de X”.

**Gancho Fase 3:** costo del fármaco / pérdida por leche descartada se calcula después sobre estos eventos + precios; no hace falta entidad de costos ahora.

### 3.6 Evento reproductivo

- `ReproEvent`: `tenant_id`, `animal_id`, `type` (celo, servicio, parto_estimado, parto, aborto, …), `event_at`, `expected_calving_at` (nullable), `notes`, `created_by`, `client_mutation_id`.
- Protocolos avanzados / TE: fuera de Fase 1; `type` abierto o tabla de tipos evita rediseño.

### 3.7 Equipo de ordeñe (stub Fase 2)

- `MilkingEquipment`: `tenant_id`, `name`, `model`, `installed_at`, ` Lobeto metadata`, `active`.
- Sin telemetría en Fase 1.
- Relaciones futuras: `Sensor`, `SensorReading`, partes/repuestos — **hijas de `MilkingEquipment`**, no de Animal.
- `MilkingSession.equipment_id` ya deja el puente sesión ↔ máquina.

### 3.8 Campos transversales para offline y auditoría

En entidades syncables:

- `id` UUID  
- `tenant_id`  
- `created_at` / `updated_at`  
- `deleted_at` (soft delete para sync)  
- `client_mutation_id` (unique por tenant) en escrituras desde móvil  
- `created_by` (user id)  
- `version` o depender de `updated_at` para LWW en fichas  

### 3.9 Ganchos Fase 3 (costos) — solo señalados

No modelar módulo de costos. Asegurar:

- Producción con litros + fechas → $/L después.
- HealthEvent con producto + retiro → costo insumos + leche descartada.
- Quien cargó / turnos → proxy de mano de obra (puede faltar entidad `LaborEntry` más adelante; no bloquea Fase 1).
- Precios e insumos serán tablas nuevas que **referencian** eventos existentes, no al revés.

### Diagrama conceptual (texto)

```
Organization
  └── Tenant (tambo)
        ├── Membership (User + Role)
        ├── MilkingEquipment (stub)
        ├── Animal
        │     ├── ProductionRecord ─── MilkingSession ─── (equipment)
        │     ├── HealthEvent
        │     └── ReproEvent
        └── (futuro) Sensor* / Cost*
```

---

## 4. Autenticación y permisos multitenant

### Decisión propuesta

- **Auth:** JWT (access corto + refresh) o sesión opaca — alineable a lo que ya usás en GestionProp. Identity en `User` global.
- **Autorización:** membership por tenant + rol. Claims útiles en el token:
  - `sub` = user id  
  - `tenant_id` = tambo activo  
  - `role` = rol en ese tambo  
  - opcional `org_id`
- **Cambio de tambo:** endpoint/acción que emite nuevo token (o setea tenant activo server-side) tras verificar membership.
- **API:** todo request de negocio exige tenant resuelto; denegar si el user no es member.
- **Mobile offline:** el token (y refresh) se guardan de forma segura; las mutaciones locales llevan `user_id`/`role` del momento; el servidor re-valida al push (el rol pudo cambiar — si ya no puede escribir, rechazar mutación y avisar).

### Matriz de permisos (Fase 1, borrador)

| Acción | Tambero | Dueño | Admin | Veterinario |
|---|---|---|---|---|
| Cargar producción / eventos (offline) | sí | opcional | sí | puntual (sanidad/repro) |
| Ver dashboard / historial | limitado | sí | sí | sí (sanidad/repro) |
| ABM animales / config tambo | no | lectura o sí | sí | no |
| Gestionar usuarios/roles | no | no / sí | sí | no |
| Ver costos (Fase 3) | no | sí | sí | no |

Ajustar según entrevistas (sobre todo vet y dueño).

### Alternativas

| Opción | Nota |
|---|---|
| **RBAC simple por enum** | Suficiente Fase 1. Recomendado. |
| **Permisos granulares (casbin, etc.)** | Overkill para 4 roles. |
| **Un user = un tenant** | Rompe dueño multi-tambo y vet itinerante. Descartado. |

### Preguntas abiertas

- ¿El veterinario es invitado por tambo (membership) o existe un “modo consulta” temporal con link mágico?
- ¿Dueño y admin son el mismo permiso en MVP (un solo rol `owner_admin`) para simplificar?

---

## 5. Estructura de monorepo sugerida

### Decisión propuesta

Monorepo (pnpm workspaces o npm workspaces; Turborepo opcional):

```
gtlt/
  apps/
    api/                 # Node + Prisma + PostgreSQL
    web/                 # React + Redux + Tailwind
    mobile/              # Expo RN (offline-first)
  packages/
    shared/              # tipos, zod schemas, enums de roles/eventos, constantes
    eslint-config/       # opcional
  docs/
    arquitectura.md
    vision-producto-tambo.md
  prompt-cursor-arquitectura-gtlt.md
```

### Qué compartir vs no compartir

| Compartir en `packages/shared` | No compartir |
|---|---|
| Enums: roles, health/repro types, animal status | Schema WatermelonDB (vive en mobile) |
| Zod (o similar) de payloads de sync y DTOs | UI components (web ≠ native) |
| Tipos TS generados desde Zod o desde Prisma (`@gtlt/shared` re-export cuidadoso) | Prisma Client (solo `apps/api`) |
| Reglas puras: “¿está en retiro de leche a fecha X?” | Redux store web |

Prisma schema vive en `apps/api` (o `packages/db` si preferís extraer el client generable para scripts). El mobile **no** importa Prisma.

### Sync package (opcional más adelante)

`packages/sync-protocol`: tipos del pull/push, versionado del protocolo (`sync_protocol_version: 1`). Útil cuando api + mobile evolucionan aparte.

---

## 6. Decisiones consolidadas (resumen)

| # | Tema | Propuesta |
|---|---|---|
| 1 | Multitenancy | Shared DB/schema + `tenant_id`; RLS como refuerzo posterior |
| 2 | Offline | SQLite local (WatermelonDB preferido) + outbox + UUID cliente; eventos append-only |
| 3 | Datos | Org→Tenant; Membership; Animal; Session+Production; Health; Repro; Equipment stub |
| 4 | AuthZ | User global + membership por tenant/rol; tenant activo en token |
| 5 | Repo | Monorepo apps(api,web,mobile) + package shared |

---

## 7. Preguntas abiertas (checklist para destrabar)

Prioridad alta (bloquean o doblan trabajo si se eligen mal):

1. **¿Tenant = tambo, o hay Organization encima?** (multi-tambo del mismo dueño)
2. **¿Cuántos dispositivos escriben a la vez en un ordeñe?**
3. **¿Offline es “solo carga” o también consulta de historial/retiro?**
4. **¿Se reutiliza el número de caravana** después de una baja?
5. **¿MVP exige litros por animal o alcanza total por bajada?**
6. **¿Dueño y admin se unifican en Fase 1?**
7. **Resultados de entrevistas de conectividad** (duración sin red, patrón WiFi del tambo vs datos móviles)

Prioridad media:

8. Proveedor de auth (email mágico, user/pass, Auth0/Clerk vs propio como GestionProp).
9. ¿WatermelonDB vs SQLite+outbox propia — preferencia por control vs velocidad?
10. ¿Voz on-device es requisito duro del MVP o nice-to-have?

---

## 8. Próximo paso sugerido (cuando cierres preguntas)

1. Congelar respuestas a §7.1–7.5.  
2. Bajar esto a un **ERD** + borrador de Prisma schema (recién ahí).  
3. Spike de 2–3 días: Expo + SQLite/WatermelonDB + push idempotente de un `HealthEvent` de mentira.  
4. Recién después: auth + pantallas de carga del tambero.

---

*Documento vivo: actualizar cuando las entrevistas cambien supuestos de conectividad o de multi-tambo.*
