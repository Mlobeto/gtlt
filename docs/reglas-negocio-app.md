# Reglas de negocio — capa aplicación / API

**Última actualización:** 2026-08-30

Validaciones que **no** se expresan como constraint de PostgreSQL (dependen de otra tabla o de lógica de dominio). Implementar en servicios antes de dar por cerrado el CRUD/sync.

## Genealogía, fotos y peso

- `breed` es texto libre a propósito (no enum), para no bloquear cruzas con porcentaje.
- `AnimalPhoto.type = CONSULT` dispara notificación (`ANIMAL_PHOTO_CONSULT`) a dueño/admin + veterinarios con acceso al tambo (`MembershipTambo`); `PROFILE` no notifica a nadie.
- No existe todavía un flag configurable de "compartir automáticamente alertas con el veterinario" (mencionado en la visión de producto original) — por ahora la notificación de fotos `CONSULT` va a **todo** veterinario con acceso al tambo, sin granularidad fina. Limitación conocida de esta fase.
- `sireId` en `Animal` normalmente se completa copiando el valor del `ReproEvent.type = SERVICE` que resultó en el nacimiento — no es obligatorio cargarlo a mano si ya está en el evento de servicio.
- `motherId` debe apuntar a un animal del mismo tenant (puede ser de otro tambo si se transfirió); `sireId` debe apuntar a un `Sire` del mismo tenant.
- `WeightEvent` no usa patrón `VOIDED`/`corrects*Id`: no dispara consecuencias aguas abajo como sí lo hacen `HealthEvent`/`MilkingSession`. Un peso mal cargado se explica en `notes` de un registro nuevo.
- `AnimalPhoto.reviewedAt`/`reviewedById` solo aplica a fotos `CONSULT`; intentar revisar una `PROFILE` es error 400.

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
- **Pendiente:** invitar/activar `TAMBERO` desde el dueño (análogo a `invite-technician` en `memberships.ts`, hoy solo existe para `TECNICO`). El dueño debe poder dar de alta más de un tambero.

## Veterinario — acceso dual (pendiente de diseño)

Decisión de producto (2026-08-30): el veterinario accede de **dos formas combinadas**, a definir en detalle:

1. **Lectura de historial** — ve `HealthEvent`/`ReproEvent` cargados por el tambero en los tambos donde tiene `MembershipTambo` (igual que hoy).
2. **Asignación de tareas** — el dueño puede asignarle visitas/tareas puntuales; el veterinario ve (al menos) lo asignado.

Falta definir: modelo de datos de "tarea asignada", si limita o no la lectura general del historial, y endpoints. No implementado todavía.

## Suscripción / Plan (pendiente de gating)

- Modelo de datos (`Plan`, `Subscription`, `Payment`) documentado en [pricing-model.md](./pricing-model.md).
- **Pendiente:** bloquear/degradar acceso de un tenant cuando su `Subscription.status` no sea `ACTIVE` (por ejemplo `PAST_DUE` o `CANCELED`). No hay ningún guard de este tipo implementado aún; hoy todos los tenants tienen acceso pleno independientemente del estado de pago.

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

## SupportTicket

Los tickets de soporte son una capa extra pensada para el ciclo de desarrollo y soporte del prototipo.

1. **Entrada del usuario**
   - Un **tenant** o usuario autenticado puede enviar una consulta desde la app móvil o desde la web del cliente.
   - Incluye: categoría, asunto, descripción, prioridad y opcionalmente tambo asociado.

2. **Categorias**
   - `BUG`: falla funcional
   - `QUESTION`: consulta de uso
   - `IMPROVEMENT`: sugerencia o mejora
   - `OTHER`: otro caso

3. **Estados**
   - `OPEN` → recién generado
   - `IN_REVIEW` → siendo revisado por equipo interno
   - `IN_PROGRESS` → ya está asignado o en tratamiento
   - `CLOSED` → resuelto

4. **Responsabilidad interna**
   - El equipo de desarrollo debe responder desde un dashboard web, no desde la app del tambo.
   - Se debe conservar una nota interna opcional para seguimiento técnico / desarrollo.

5. **Relación con tenant**
   - Todo ticket queda asociado a `tenantId` y, si aplica, a `tamboId` y `userId`.
   - Esto permite filtrar por cliente, por tambo y por estado en la vista admin.

## AppPrototypeConfig

La configuración del prototipo debe quedar centralizada para usarla en el dashboard de desarrolladora.

1. **Datos relevantes**
   - nombre del prototipo
   - versión actual
   - URL del código
   - URL del prototipo / demo
   - notas de testing o despliegue
   - activo/inactivo

2. **Uso esperado**
   - El dashboard interno debe leer esta configuración y mostrarla en una tarjeta principal.
   - Sirve como punto de referencia para QA, usuarios demo y soporte técnico.

3. **No reemplaza**
   - Esta configuración no reemplaza la app del tambo ni su flujo de soporte; solo centraliza la info del prototipo activo para el equipo.
