# Reglas de negocio — capa aplicación / API

Validaciones que **no** se expresan como constraint de PostgreSQL (dependen de otra tabla o de lógica de dominio). Implementar en servicios antes de dar por cerrado el CRUD/sync.

## PartInstance

1. **`bajadaNumber` vs `PartType.appliesPerBajada`**
   - Si `PartType.appliesPerBajada = true` → `bajadaNumber` es **obligatorio** (1…N).
   - Si `PartType.appliesPerBajada = false` → `bajadaNumber` debe ser **null** (pieza a nivel tambo, ej. equipo de frío).

2. **`bajadaNumber` vs `Tambo.bajadaCount`**
   - Si `bajadaNumber` no es null → debe cumplir `1 <= bajadaNumber <= Tambo.bajadaCount`.

3. **Vigencia**
   - Al reemplazar una pieza: setear `replacedAt` en la instancia anterior y crear una nueva fila (no update in-place del tipo/instalación).
   - La unicidad de “una vigente por (tambo, tipo, bajada|tambo-level)” la garantiza SQL en `docs/partial-indexes.sql`.

4. **Quién carga / reemplaza (decisión de producto)**
   - Alta y reemplazo de piezas de ordeñe y frío: **mobile**, en el tambo.
   - Pueden hacerlo **`TAMBERO` o `DUENIO`** (también `ADMIN` si aplica).
   - Alertas de vida útil / pedidos / resumen remoto: web dueño (Fase 2); no bloquean la carga en mobile.

## Correcciones append-only

Aplica a `MilkingSession`, `ControlLechero` (header) y `MilkDelivery`:

1. Marcar el registro previo `status = VOIDED`.
2. Insertar uno nuevo `ACTIVE` con `corrects*Id` apuntando al anulado.
3. `ControlLecheroLine` no se corrige sola: al corregir un control se anula el header y se crean líneas nuevas bajo el header nuevo.

## Membership / tambos

- `DUENIO` o `ADMIN` → acceso a todos los tambos del tenant.
- Solo `TAMBERO` / `VETERINARIO` / `TECNICO` → alcance = filas de `MembershipTambo`.
- `TECNICO` **nunca** acceso automático a todos los tambos; es actor externo (puede ser de distintos fabricantes; `companyName` texto libre en Membership).
- `Membership.status`: `PENDING` (invitación) | `ACTIVE`. Login solo con `ACTIVE`.
- API: sesión solo-`TECNICO` tiene **lista blanca** de recursos (`part-types`, `part-instances`, `service-requests`, `tambos`, `auth`). Animales/producción/sanidad/repro denegados a nivel guard global.

## ServiceRequest

- Ticket de service: estados `PENDING_APPROVAL` → `OPEN` → … → `RESOLVED` / `CANCELLED`.
- **No** usa patrón `VOIDED`/`corrects*Id`. Mal cargado → `CANCELLED` + solicitud nueva.
- Urgencia: `NORMAL` | `URGENT`.
- Flag por tambo `serviceRequiresOwnerApproval` (default `false`):
  - Si está apagado: el pedido nace en `OPEN` (técnico lo ve).
  - Si está prendido y pide un **tambero**: nace en `PENDING_APPROVAL` (técnico **no** lo ve).
  - Si pide **dueño/admin**: siempre `OPEN` (no se auto-bloquea).
- Dueño/admin aprueba (`POST .../approve` → `OPEN`) o rechaza (`POST .../reject` → `CANCELLED`).
- Notificación in-app al dueño **siempre** que haya pedido (`SERVICE_REQUESTED` o `SERVICE_PENDING_APPROVAL`). Push Expo/WhatsApp después.
- Al aprobar/rechazar se notifica al tambero que creó el pedido.
