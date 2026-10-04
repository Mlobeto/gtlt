# Reglas de negocio — capa aplicación / API

**Última actualización:** 2026-10-04

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
   - La fecha de instalación es **obligatoria** y **corregible** (`PATCH /part-instances/:id`). No puede ser anterior a 2000-01-01 ni más de un día en el futuro.
   - `installedAtApprox = true` cuando se eligió un chip relativo (“hace 3 meses”); `false` si es “Hoy” o una fecha escrita `AAAA-MM-DD`.

5. **Vida útil**
   - `REACTIVE`: se cambia cuando falla; **sin vencimiento**.
   - `USAGE_BASED`: tiene vida útil planificada por **ordeñes** y/o **meses** (el nombre del enum quedó por historia). Vale la regla que se cumpla primero (el mayor porcentaje).
   - `BRANDED`: se conserva el enum (equipo de frío histórico). **Ya no es especial**: la ficha de cualquier tipo, incluido el frío, se define con campos. Tipos nuevos: `REACTIVE` o `USAGE_BASED`.
   - Estimación de ordeñes: `2 turnos/día × vacas ACTIVE del tambo / bajadaCount` (reparto parejo; las secas no se ordeñan). Días enteros desde `installedAt`. Si `usageCounter` trae valor, **tiene prioridad** y se marca como “contado”.
   - Por tiempo: días / (`lifeMonths` × 30,44). Estado: `OK` &lt; 80 %, `SOON` 80–100 %, `OVERDUE` ≥ 100 %.
   - El catálogo lo administra la desarrolladora (`/admin/part-types`). **No se borran tipos**: solo se desactivan. Las piezas ya cargadas se conservan.
   - Los umbrales efectivos son los de `TenantPartTypeConfig` si existen; si no, los del `PartType`. Las demás piezas no tienen vencimiento.

6. **Campos configurables por tipo (`PartTypeField`)**
   - Cada tipo tiene una ficha definida por la desarrolladora (`POST/PATCH /admin/part-types/:id/fields`). Tipos de dato: `TEXT` (hasta 200 caracteres), `NUMBER` (finito; `min`/`max` si existen), `SELECT` (valor de `options`), `BOOLEAN`.
   - `key` se genera de la etiqueta (minúsculas, guiones bajos) y **no se edita**. `kind` no se cambia si alguna pieza ya tiene un valor para ese campo (`409` con la cantidad). Quitar una opción de `SELECT` que alguna pieza usa también es `409`.
   - No se borran campos: solo `active`. Los valores ya cargados se conservan.
   - Los valores viven en `PartInstance.attributes` (JSON) y se validan contra los campos **activos**. Claves desconocidas o de campos inactivos: `400`.
   - Piezas viejas de frío: la migración `part_fields_and_power_supply` copió `cold_equipment_details` a `attributes` (`brand`, `model`, `tank_capacity_l` desde `capacity_liters`, `cooling_capacity`, `controller_model`). La tabla `cold_equipment_details` **sigue**: se lee para piezas viejas; las cargas nuevas no escriben ahí.

### Corriente eléctrica del tambo

- `Tambo.powerSupply` y `TamboRequest.powerSupply`: `MONOPHASE` | `THREEPHASE` | nulo (sin informar). Es un dato del **tambo**, no de una pieza.
- En un pedido con hardware es **obligatorio**. En solo-software es opcional. Al convertir el pedido en tambo (`POST /admin/tambos`) se copia. Dueño/admin y desarrolladora pueden corregirlo (`PATCH /tambos/:id`, `PATCH /admin/tambos/:id`).
- El técnico lo ve en `GET /service-requests/workspace` y `GET /my/service-requests`.

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

### Roles compuestos (celular)

- No existe un rol "dueño-tambero". `Membership.roles` es una lista: "dueño que también ordeña" es `DUENIO` + `TAMBERO`.
- El menú se arma por módulos. Con dos roles se ve la suma. Un dueño/admin **sin** `TAMBERO` ni `VETERINARIO` no ve Ordeñe, Sanidad, Repro, Entrega, Control lechero ni Retiros; ve supervisión (bomba, service por aprobar, fotos) más Vacas, Máquinas, Service, Avisos, Cuenta y Mis tambos.
- `DUENIO`/`ADMIN` + `TAMBERO`: supervisión **y** las listas de acción de "Hoy", más el menú operativo.
- Tambero o veterinario solos: el menú operativo como hasta ahora (el veterinario no se cambia). Técnico: sin cambios.
- Interruptor **Yo también ordeño** (`PATCH /memberships/me/tambero-role`): solo dueño/admin, sobre la membresía propia. Agrega o quita `TAMBERO` y reemite el JWT. No toca `DUENIO`/`ADMIN` ni otros roles.

### Tambos (pedido / cotización / instalación / activación)

- El dueño **no crea tambos**. Pide uno (`POST /tambo-requests`): nombre, dirección opcional, bajadas (1–60), hardware (sensor de bomba, caudalímetros, lectores) y, si hay hardware, un proveedor del catálogo. La API calcula `equipmentList` (1 sensor de bomba; 1 caudalímetro y 1 lector por bajada si se piden). Solo software: `serviceProviderId` nulo. Estado inicial `SENT`.
- Cotización: hoy la carga la **desarrolladora en nombre del proveedor** (`PATCH /admin/tambo-requests/:id/quote`, validación en `validateTamboQuote` — reutilizable cuando exista el panel de proveedor). Pasa a `QUOTED`. El dueño ve la cotización y `POST /tambo-requests/:id/accept` o `/decline` (solo `QUOTED`). Puede `cancel` si está `SENT` o `QUOTED`.
- Creación: **solo la desarrolladora** (`POST /admin/tambos` `{ requestId }`). Desde un pedido `ACCEPTED`, o `SENT` si es solo software. Nace **en instalación** (`active = true`, `activatedAt` nulo): usable (un técnico autorizado puede registrar dispositivos) y **no se factura**. El pedido queda `CONVERTED` con `tamboId`. No se convierte dos veces (`409`).
- Activación: **solo la desarrolladora** (`POST /admin/tambos/:id/activate`) setea `activatedAt`. Desde ahí cuenta para la suscripción. `409` si ya está activo o está archivado. Todos los pedidos pasan por este paso, también los solo-software.
- Estados derivados: archivado (`active = false`), en instalación (`active` y `activatedAt` nulo), activo (`active` y `activatedAt` no nulo). `GET /tambos` incluye `state`. Los tambos en instalación aparecen en listas y selectores como cualquier otro.
- Restaurar (`PATCH /tambos/:id/active` `{ active: true }`): solo `DUENIO`/`ADMIN`, suscripción `ACTIVE`.
- `GET /tambos` lista solo `active`; `?includeArchived=1` incluye archivados. Login, `TamboPicker` y mobile usan la lista activa (incluye en instalación).
- Editar nombre (2–80) y `bajadaCount` (1–60). Subir bajadas es libre. **Bajarlas** se rechaza (`409` `BAJADAS_EN_USO`) si hay `PartInstance` vigente o `Device` no retirado con `bajadaNumber` mayor al valor nuevo; el error lista tipo y bajada.
- Archivar (`active = false`) no borra datos. No se puede archivar el último tambo activo (`409`). Si hay dispositivos no retirados: `409` `TAMBO_HAS_DEVICES` (cantidad y tipos). El dueño pide el retiro con `POST /tambos/:id/request-device-removal` (pedido `OTHER` / `NORMAL`, texto fijo; si ya hay uno abierto se reusa).
- `GET /tambos/billing-summary` cuenta solo tambos activos facturables y agrega `installingTambos`. `GET /admin/tenants` devuelve `activeTambos` e `installingTambos`. Cortesía (`LIFETIME` o precio 0) devuelve montos en 0.

### Dispositivos

- Cada tambo puede tener periféricos (`DeviceKind`: `VACUUM_PUMP_SENSOR`, `FLOW_METER`, `RFID_READER`). Los endpoints `/device/*` autentican con `X-Device-Token` contra `Device.deviceToken`.
- **El dueño no da de alta hardware.** Lo hacen la desarrolladora (`/admin/devices`) o un **técnico autorizado como instalador** (`Membership.canInstallDevices = true`) en los tambos de su alcance (`MembershipTambo`). Ese permiso **solo lo otorga la desarrolladora** (`PATCH /admin/memberships/:id/installer`), y solo si el técnico tiene proveedor formal (`serviceProviderId`); un independiente no se autoriza (`409`). Tener proveedor no alcanza: lo elige el dueño al invitar. El permiso se consulta en la base en cada llamada (revocar vale al toque). Un técnico sin el permiso, el dueño, el tambero y el veterinario solo ven.
- Los dispositivos **no se borran: se retiran** (`retiredAt`). Retirado, o tambo archivado (`Tambo.active = false`), deja de ser aceptado (`403` `DEVICE_RETIRED` / `TAMBO_ARCHIVED`) y no se toca `lastSeenAt`.
- El alta crea el registro y entrega la clave una sola vez (también al rotar). `connected` = reportó en los últimos 5 minutos (`lastSeenAt`).
- `bajadaNumber` obligatorio (1…`Tambo.bajadaCount`) para `FLOW_METER` y `RFID_READER`; nulo para `VACUUM_PUMP_SENSOR`. Un solo sensor de bomba no retirado por tambo, y un solo dispositivo no retirado por `(tambo, kind, bajadaNumber)` (`409`).

### Invitaciones

- Endpoints: `POST /memberships/invite-technician` (dueño/tambero/admin invita `TECNICO`) y `POST /memberships/invite` (dueño/admin invita `TAMBERO` o `VETERINARIO`). Crean un `User` stub si no existe, la `Membership` en `PENDING` y el `MembershipTambo`.
- **El token identifica la membership** — nunca `tenantId` + email/teléfono. 32 bytes random (hex), vence a los **7 días** y es de **un solo uso** (se limpia al aceptar). Hoy se entrega a mano: viaja en la respuesta del endpoint de invitación (`inviteToken`) y el panel/app ofrece copiarlo o compartirlo. Cuando exista envío automático por email/WhatsApp, ese campo debe dejar de viajar en la respuesta.
- **Invitado sin cuenta** → `POST /memberships/accept-invite/register` con `inviteToken` + clave. Solo sirve para usuarios stub (sin contraseña).
- **Nunca se sobrescribe la contraseña de una cuenta existente.** Si el usuario del token ya tiene clave, el register responde `409` `code: "ACCOUNT_EXISTS"` sin escribir nada; el invitado debe iniciar sesión con su clave y aceptar autenticado.
- **Aceptar autenticado** → `POST /memberships/accept-invite` con `inviteToken`. Busca la membership por token (no por el tenant de la sesión, así sirve para invitaciones de otro tenant) y exige que `membership.userId` sea el usuario logueado (`403` si no). Vale para cualquier rol.
- **Invitar a alguien que ya es miembro `ACTIVE` del tenant no cambia sus roles ni su estado.** Si ya tiene el rol pedido, solo se le agrega el tambo (respuesta con `inviteToken: null`); si tiene otro rol, `409` y no se toca nada.
- Login con usuario en varios tenants: `/auth/login` responde `400` con `tenants`; web y mobile muestran la lista y reintentan con el `tenantId` elegido.

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
