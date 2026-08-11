# GTLT — ERD Fase 1 (detalle)

**Documento padre:** [arquitectura.md](./arquitectura.md)  
**Estado:** migrado en DB local (`20260809003221_init`)  
**Fuente de verdad del schema:** `apps/api/prisma/schema.prisma`  
**Convenciones:** UUID en todas las PK (generables offline) · entidades operativas con `tenant_id` + `tambo_id` · eventos append-only salvo ficha `Animal` (LWW)

---

## 1. Diagrama conceptual

```
User
  └── Membership (tenant_id, roles[])
        └── MembershipTambo*          (*solo si hace falta acotar; dueño/admin ⇒ todos)

Tenant
  └── Tambo
        ├── Animal (tambo_id mutable)
        │     ├── AnimalTransferEvent (from_tambo → to_tambo)
        │     ├── HealthEvent
        │     ├── ReproEvent
        │     └── ControlLecheroLine ── ControlLechero
        ├── MilkingSession (turno; ACTIVE/VOIDED + corrects_session_id)
        ├── MilkDelivery
        ├── PartInstance ── PartType (catálogo global)
        │     └── ColdEquipmentDetail? (1:1 si pattern = BRANDED)
        └── (futuro) Sensor* / Cost*

TenantPartTypeConfig (tenant × PartType) — override de umbral USAGE_BASED
```

---

## 2. Entidades

### 2.1 Tenant
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| name | string | Cuenta / facturación |
| timezone | string | default `America/Argentina/Buenos_Aires` |
| settings | Json? | config libre Fase 1 |
| createdAt / updatedAt | datetime | |

**Relaciones:** 1—N Tambo, Membership, TenantPartTypeConfig.

### 2.2 Tambo
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId | UUID FK | |
| name | string | Establecimiento físico |
| bajadaCount | int | Cantidad de bajadas (≤20 típico); alimenta fórmula de `usage_counter` |
| active | bool | |
| createdAt / updatedAt | datetime | |

**Índices:** `(tenantId)`, `(tenantId, name)`.

### 2.3 User
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| email | string? unique | |
| phone | string? | |
| name | string | |
| passwordHash | string? | auth a definir; placeholder |
| createdAt / updatedAt | datetime | |

### 2.4 Membership
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId | UUID FK | |
| userId | UUID FK | |
| roles | Role[] | `TAMBERO` \| `DUENIO` \| `ADMIN` \| `VETERINARIO` — varios a la vez |
| createdAt / updatedAt | datetime | |

**Regla de alcance (app, no DB):**  
- Si `roles` incluye `DUENIO` o `ADMIN` → acceso a **todos** los tambos del tenant (ignorar / no exigir `MembershipTambo`).  
- Si solo roles operativos → el alcance es la lista en `MembershipTambo` (Fase 1: mismo alcance para todos los roles del membership; caso cruzado fuera de alcance).

**Índices:** unique `(tenantId, userId)` · `(userId)`.

### 2.5 MembershipTambo
| Campo | Tipo | Notas |
|---|---|---|
| membershipId | UUID FK | |
| tamboId | UUID FK | debe ser del mismo tenant (validar en app) |
| tenantId | UUID | denormalizado para queries/RLS futuro |

**Índices:** unique `(membershipId, tamboId)` · `(tenantId, tamboId)`.

### 2.6 Animal (ficha — LWW)
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId | UUID | |
| tamboId | UUID FK | **mutable** (transferencia) |
| earTag | string | caravana visual |
| status | AnimalStatus | `ACTIVE`, `DRY`, `SOLD`, `DEAD`, … |
| birthDate | date? | |
| enteredAt | date? | ingreso al rodeo |
| photoUrl | string? | URL storage externo (servicio TBD) |
| electronicId | string? | futuro RFID — nullable |
| notes | string? | |
| version | int | optimistic / LWW auxiliar |
| clientMutationId | string? | idempotencia sync |
| createdById | UUID? FK User | |
| createdAt / updatedAt / deletedAt | datetime | soft delete para sync |

**Unicidad:** parcial `(tamboId, earTag)` WHERE `status IN (ACTIVE, DRY) AND deletedAt IS NULL` — **vía SQL raw en migración** (Prisma no expresa partial unique).  
**Índices app:** `(tenantId, tamboId, status)`, `(tenantId, tamboId, updatedAt)` sync pull.

### 2.7 AnimalTransferEvent (append-only)
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId | UUID | |
| animalId | UUID FK | |
| fromTamboId | UUID | |
| toTamboId | UUID | |
| transferredAt | datetime | |
| notes | string? | |
| createdById | UUID FK | |
| clientMutationId | string? | |
| createdAt | datetime | |

Al transferir: actualizar `Animal.tamboId` + insertar este evento. Los eventos históricos (`HealthEvent`, etc.) **conservan** el `tamboId` del momento de carga.

**Índices:** `(tenantId, animalId, transferredAt)`, `(tenantId, toTamboId, transferredAt)`.

### 2.8 MilkingSession (append-only + correcciones)
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId | UUID | |
| tamboId | UUID FK | |
| sessionDate | date | día del ordeñe (timezone del tambo/tenant) |
| shift | MilkingShift | `MORNING` \| `AFTERNOON` |
| totalLiters | Decimal | total del turno — sin desagregar |
| status | RecordStatus | `ACTIVE` \| `VOIDED` |
| correctsSessionId | UUID? FK self | nueva corrección apunta a la sesión anulada |
| notes | string? | |
| createdById | UUID FK | trazabilidad multi-dispositivo |
| clientMutationId | string? | |
| createdAt / updatedAt | datetime | |

**Flujo corrección:** en una transacción, marcar sesión previa `VOIDED` y crear nueva `ACTIVE` con `correctsSessionId`.  
**Unicidad:** parcial `(tamboId, sessionDate, shift)` WHERE `status = ACTIVE` — **SQL raw**.  
**Índices:** `(tenantId, tamboId, sessionDate)`, `(tenantId, tamboId, createdAt)`, `(correctsSessionId)`.

**Uso en parts:** contar turnos `ACTIVE` desde `PartInstance.installedAt` para `usage_counter`.

### 2.9 ControlLechero + ControlLecheroLine
Evento periódico (~6 meses), fuente distinta a la carga diaria.  
**Append-only** con el mismo patrón que `MilkingSession` (`status` + `correctsControlId`). Las líneas no se corrigen solas: se anula el header y se crean líneas nuevas.

**ControlLechero**
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId / tamboId | UUID | |
| performedAt | datetime | |
| source | ControlLecheroSource | `EXTERNAL_TECHNICIAN` ahora; `FLOW_METER` futuro |
| technicianName | string? | |
| status | RecordStatus | `ACTIVE` \| `VOIDED` |
| correctsControlId | UUID? FK self | |
| notes | string? | |
| createdById | UUID FK | |
| clientMutationId | string? | |
| createdAt / updatedAt | datetime | |

**ControlLecheroLine**
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId / tamboId | UUID | denormalizados |
| controlLecheroId | UUID FK | |
| animalId | UUID FK | |
| bajadaNumber | int | |
| liters | Decimal | |
| createdAt | datetime | |

**Índices:** header `(tenantId, tamboId, performedAt)` · lines `(controlLecheroId)` · `(tenantId, tamboId, animalId)`.  
Estructura alineada a lo que un caudalímetro podría empujar después (sesión + líneas por punto de medición/animal).

### 2.10 MilkDelivery (append-only)
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId / tamboId | UUID | |
| periodStart / periodEnd | datetime | período reconciliado |
| coldTankLiters | Decimal | medidos por equipo de frío |
| truckDeclaredLiters | Decimal | declara el camión |
| coldTankTemperatureC | Decimal? | temp lado tanque/tambo |
| truckTemperatureC | Decimal? | temp declarada industria/camión (plus por temperatura) |
| coldEquipmentInstanceId | UUID? FK PartInstance | equipo de frío BRANDED involucrado |
| status | RecordStatus | `ACTIVE` \| `VOIDED` |
| correctsDeliveryId | UUID? FK self | |
| notes | string? | |
| createdById | UUID FK | |
| clientMutationId | string? | |
| createdAt / updatedAt | datetime | |

**Índices:** `(tenantId, tamboId, periodStart)` · `(coldEquipmentInstanceId)` (entregas por equipo / EKC 202).

### 2.11 HealthEvent (append-only)
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId / tamboId | UUID | tambo al momento del evento |
| animalId | UUID FK | |
| type | HealthEventType | `MASTITIS`, `TREATMENT`, `OTHER` |
| eventAt | datetime | |
| productName | string? | fármaco / producto (texto Fase 1) |
| milkWithdrawalUntil | datetime? | **crítico offline** — cachear vigentes |
| notes | string? | |
| createdById | UUID FK | |
| clientMutationId | string? | |
| createdAt / updatedAt / deletedAt | datetime | |

**Índices (queries calientes):**  
- `(tenantId, tamboId, milkWithdrawalUntil)` — retiros vigentes  
- `(tenantId, tamboId, eventAt)` — historial reciente  
- `(tenantId, animalId, eventAt)`  
- `(tenantId, tamboId, updatedAt)` — sync pull  

### 2.12 ReproEvent (append-only)
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId / tamboId | UUID | |
| animalId | UUID FK | |
| type | ReproEventType | `HEAT`, `SERVICE`, `EXPECTED_CALVING`, `CALVING`, `ABORTION`, `OTHER` |
| eventAt | datetime | |
| expectedCalvingAt | date? | |
| notes | string? | |
| createdById | UUID FK | |
| clientMutationId | string? | |
| createdAt / updatedAt / deletedAt | datetime | |

**Índices:** `(tenantId, tamboId, eventAt)`, `(tenantId, animalId, eventAt)`, `(tenantId, tamboId, updatedAt)`.

### 2.13 PartType (catálogo global)
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| code | string unique | ej. `LINER`, `PULSE_SHORT_TUBE`, `CLAW`, `COLD_TANK` |
| name | string | |
| pattern | PartReplacementPattern | `USAGE_BASED` \| `REACTIVE` \| `BRANDED` |
| defaultUsageThreshold | int? | default 2000 ordeñes si USAGE_BASED |
| appliesPerBajada | bool | true → grupo de ordeñe por bajada |
| description | string? | |

No lleva `tenant_id` (no es entidad operativa).

### 2.14 TenantPartTypeConfig
Override de umbral por tenant.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId | UUID | |
| partTypeId | UUID FK | |
| usageThreshold | int | override del default |

**Unique:** `(tenantId, partTypeId)`.

### 2.15 PartInstance
| Campo | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| tenantId / tamboId | UUID | |
| partTypeId | UUID FK | |
| bajadaNumber | int? | required si `PartType.appliesPerBajada`; null a nivel tambo |
| installedAt | datetime | |
| brandModel | string? | texto libre opcional (piezas genéricas) |
| photoUrl | string? | URL storage TBD — puede ser ID principal de la pieza |
| usageCounter | Decimal? | solo USAGE_BASED; **calculado por app**, no carga manual |
| replacedAt | datetime? | null = instancia vigente; al reemplazar se cierra y se crea otra |
| notes | string? | |
| createdById | UUID? | |
| clientMutationId | string? | |
| createdAt / updatedAt | datetime | |

**Fórmula `usageCounter` (comentario en schema):**  
`(vacas_en_ordeño_del_tambo / tambo.bajadaCount) × (cantidad de MilkingSession ACTIVE del tambo con sessionDate/turno ≥ installedAt)`.  
`vacas_en_ordeño` = count de `Animal` con `status = ACTIVE` en ese tambo (definir si DRY cuenta — app).

**Alertas por umbral:** lógica de aplicación; no DB.

**Grupo de ordeñe (lógico):** por cada `bajadaNumber`, hasta 4 instancias vigentes (centralizador, copas, pezoneras, tubos cortos) — cada una con su `partTypeId`.

**Índices:**  
- `(tenantId, tamboId, replacedAt)`  
- `(tenantId, tamboId, bajadaNumber, partTypeId)`  
- partial unique vigencia: **dos** índices (ver `docs/partial-indexes.sql`) — por bajada (`bajada_number IS NOT NULL`) y a nivel tambo (`bajada_number IS NULL`), porque en Postgres `NULL != NULL`

**Reglas app:** `docs/reglas-negocio-app.md` (`bajadaNumber` vs `appliesPerBajada` / `bajadaCount`).

### 2.16 ColdEquipmentDetail (1:1 PartInstance BRANDED)
| Campo | Tipo | Notas |
|---|---|---|
| partInstanceId | UUID PK/FK | |
| brand | string | |
| model | string | |
| capacityLiters | Decimal | |
| coolingCapacity | string o Decimal | capacidad de frío (unidad a confirmar en UI; string flexible Fase 1) |
| controllerModel | string? | ej. EKC 202 vs 101 — gancho integración Modbus |

### 2.17 Campos sync comunes
En entidades syncables desde mobile: `id` cliente, `clientMutationId` unique por `(tenantId, clientMutationId)` cuando no null, `createdById`, `createdAt`/`updatedAt`, `deletedAt` donde aplique soft delete.

---

## 3. Índices prioritarios (queries típicas)

| Query | Índice |
|---|---|
| Sesiones de un tambo en rango de fechas | `MilkingSession (tenantId, tamboId, sessionDate)` |
| Retiros de leche vigentes offline | `HealthEvent (tenantId, tamboId, milkWithdrawalUntil)` |
| Historial sanitario/repro reciente | `(tenantId, tamboId, eventAt)` |
| Animal por caravana en tambo | partial unique `(tamboId, earTag)` activos |
| Sync pull por cursor | `(tenantId, tamboId, updatedAt)` en fichas/eventos |
| Piezas vigentes de un tambo | `PartInstance (tenantId, tamboId, replacedAt)` |
| Entregas del período | `MilkDelivery (tenantId, tamboId, periodStart)` |
| Entregas de un equipo de frío | `MilkDelivery (coldEquipmentInstanceId)` |

---

## 4. Ganchos fases futuras (sin implementar)

| Fase | Enganche |
|---|---|
| Sensores (vacuómetro, bomba, EKC 202) | Nueva entidad `Sensor` / `SensorReading` FK → `Tambo` y/o `PartInstance` (frío). `MilkingSession` podría autocompletarse por sensor de bomba. Diseño bomba de vacío: [sensores-bomba-vacio.md](./sensores-bomba-vacio.md). |
| Caudalímetro | `ControlLechero.source = FLOW_METER` (+ líneas); no mezclar con total diario de `MilkingSession` hasta definir producto |
| Costos | Tablas de precios/insumos que referencian `MilkingSession`, `HealthEvent`, etc. por id — no al revés |
| RFID | `Animal.electronicId` |
| Pedido partes Lobeto | sobre `PartInstance` + umbrales |

---

## 5. Partial indexes (migración SQL — no expresables en Prisma)

SQL listo para pegar en la migration: **`docs/partial-indexes.sql`**.

1. `MilkingSession`: UNIQUE `(tambo_id, session_date, shift) WHERE status = 'ACTIVE'`
2. `Animal`: UNIQUE `(tambo_id, ear_tag) WHERE status IN ('ACTIVE','DRY') AND deleted_at IS NULL`
3. `PartInstance`: dos UNIQUE parciales (por bajada / a nivel tambo) WHERE `replaced_at IS NULL`

---

## 6. Decisiones de modelado aplicadas (cerradas)

- Alcance de tambo a nivel **Membership** (lista), no por rol.
- Append-only con corrección: `MilkingSession`, `ControlLechero`, `MilkDelivery` (`ACTIVE`/`VOIDED` + `corrects*Id`).
- Caravana única por **tambo** entre activos.
- Transferencia de animal: `tamboId` mutable + `AnimalTransferEvent`.
- Mantenimiento: `PartType` + `PartInstance` (+ `ColdEquipmentDetail`), no stub vacío `MilkingEquipment`.
- `photoUrl` = string URL (storage TBD) en `Animal` y `PartInstance`.
- Reglas app de `PartInstance.bajadaNumber`: `docs/reglas-negocio-app.md`.
