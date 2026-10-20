# Reglas de negocio — capa aplicación / API

**Última actualización:** 2026-10-20 (entrega: momento del camión)

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
   - Por bajada: una vigente por `(tambo, tipo, bajada)` (`part_instances_one_active_per_bajada`).
   - Nivel tambo: una vigente por `(tambo, tipo, label normalizado)` (`part_instances_one_active_tambo_level`). `label` se compara en minúsculas y sin espacios de más (`lower(btrim(label))`); nulo cuenta como `''`.
   - Si `PartType.allowsMultiple` es falso, no hay nombre: una sola pieza vigente por tipo y tambo. Si es verdadero (solo tipos que **no** son por bajada), cada unidad lleva `PartInstance.label` obligatorio (1–60), único en ese tipo y tambo.
   - `allowsMultiple` lo marca la desarrolladora. No se puede activar en un tipo por bajada (`400`). No se puede desactivar si algún tambo ya tiene más de una pieza vigente (`409` con la cantidad de tambos).
   - Unidades por pieza (`PartType.quantityPerInstance`, 1–100, default 1): **informativo** (listas de compra). No cambia el cálculo de vida útil, que sigue siendo **por pieza**.
   - Los repetidores de pulsado no tienen rango de bajadas en el modelo: son un tipo repetible con un campo de ficha de texto ("Bajadas que cubre").
   - Limitación conocida: el sensor del relé de la bomba sigue siendo **uno por tambo**. Un sensor por bomba queda para más adelante.

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

## Informe de trabajo (`WorkReport`)

Contenedor de un trabajo: fecha (`performedAt`), resumen (hasta 2000), tareas (hasta 30 textos de 200), horas (0–100, opcional), mediciones libres `{ label, value, unit? }` (hasta 20; **no** se comparan todavía con el rendimiento de fábrica), fotos (hasta 6, URLs de `POST /uploads/photo`) y las piezas cambiadas en ese trabajo.

### Estados

- `DRAFT`: solo lo edita el autor. Dueño/admin lo pueden leer. No se lista a los demás.
- `SUBMITTED`: queda **cerrado**. No se edita ni se le agregan piezas.

### Quién lo arma

- **Técnico:** siempre ligado a un pedido de service que vea, en estado `ACKNOWLEDGED`, `IN_PROGRESS` o `RESOLVED`. Sin ese pedido: `400`. Al enviarlo, `notifyOwners` avisa a dueños y administradores: título "Informe de trabajo", cuerpo con nombre, tambo, cantidad de piezas y de tareas.
- **Tambero, dueño o administrador:** el mismo informe **sin pedido**, marcado "Trabajo propio". Si mandan `serviceRequestId`, se valida igual que para el técnico.
- `authorRole` sale de la sesión. Si hay dos roles, gana el más específico: `TECNICO` primero, después `TAMBERO`, `DUENIO`, `ADMIN`.

### Cambio de piezas

- **Todo cambio de piezas pertenece a un informe.** `POST /work-reports/:id/replace-parts` solo en borrador y solo el autor. Todas las piezas del mismo tambo, vigentes; una inválida invalida todo (`invalidIds`) y no se cambia nada.
- El atajo **"Ya las cambié"** (`POST /part-instances/replace-batch`, tambero/dueño/admin, **no** técnico) crea un informe propio con resumen automático "Cambio de {N} piezas: {tipos}", hace el reemplazo y lo deja `SUBMITTED`.
- El reemplazo individual `POST /part-instances/:id/replace` sigue igual (una pieza, mismos roles de tambo).
- La vida útil de la pieza **nueva** arranca desde su `installedAt`. No se cambia la fórmula.
- Borrar un borrador: solo el autor, y solo si todavía no hay piezas cambiadas. Esos cambios **no** se revierten.

### Historial

`GET /part-instances/history?tamboId=&partTypeId=&bajadaNumber=&label=`: instalaciones **anteriores** (`replacedAt` no nulo) del mismo tipo y posición, de la más reciente a la más vieja, con días en servicio. Si el tipo tiene vida por ordeñes, los ordeñes estimados se calculan con `estimatePartLife` y `now = replacedAt` (usa la cantidad **actual** de vacas).

### Offline

Registrar informes y cambios de piezas necesita conexión, igual que el resto de la carga de máquinas. No hay cola offline.

## Entrega de leche (camión de la fábrica)

En las pantallas se habla de **entrega** y **camión de la fábrica**. Nunca “retiro”: en CAL “retiro” es la leche que no se puede entregar por un tratamiento.

### Momento

- Cada entrega ACTIVE puede tener `pickupDate` (fecha calendario, sin hora) y `pickupShift` (`MORNING` o `AFTERNOON`): “después del ordeñe de la mañana/tarde”.
- Se ordena por `(fecha, turno)` con la mañana antes que la tarde. No se usan horas ni zonas horarias.
- El momento es obligatorio en los clientes actuales; un cliente viejo que no lo mande sigue pudiendo crear la entrega, queda “sin momento” y no es comparable.
- Unicidad: un solo ACTIVE por `(tambo, pickup_date, pickup_shift)` cuando hay fecha (`milk_deliveries_one_active_per_pickup`). Conflicto → 409.

### Qué ordeñes entran

- Entran las `MilkingSession` ACTIVE de turnos **posteriores** al momento de la entrega anterior y **hasta** el momento de esta, inclusive en el extremo final.
- La primera entrega del tambo no es comparable (no hay entrega anterior).
- Si falta algún turno del período (hay dos por día), **no se calcula** la diferencia: se informa cuáles faltan. Una comparación con datos incompletos es peor que ninguna.
- Sesiones `VOIDED` no cuentan.

### Cuenta

- `esperado = ordeñado − litros para la guachera`
- `diferencia = litros de la fábrica − esperado`
- `porcentaje = diferencia / esperado × 100` (un decimal). Un porcentaje negativo significa que la fábrica informa menos de lo que CAL midió.
- Todavía **no** se descuentan vacas en tratamiento ni calostro: hace falta litros por vaca.

### Umbral y quién ve

- `Tambo.deliveryDiffThresholdPct` (0,1–50) es por tambo y **no tiene valor por defecto**. Si el dueño no lo configura, la comparación se muestra con estado `NO_THRESHOLD` y no marca alerta.
- `|porcentaje| > umbral` → `ALERT`. Si no lo supera → `OK`.
- Solo `DUENIO` y `ADMIN` ven la comparación (`GET /milk-deliveries/comparisons`). El tambero carga entregas y ve la lista de las suyas, sin diferencias.
- La alerta es solo un estado en pantalla. Este prompt no envía avisos.

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
- API: sesión solo-`TECNICO` tiene **lista blanca** de recursos (`part-types`, `part-instances`, `service-requests`, `work-reports`, `uploads`, `tambos`, `auth`). Animales/producción/sanidad/repro denegados a nivel guard global.

### Roles compuestos (celular)

- No existe un rol "dueño-tambero". `Membership.roles` es una lista: "dueño que también ordeña" es `DUENIO` + `TAMBERO`.
- El menú se arma por módulos. Con dos roles se ve la suma. Un dueño/admin **sin** `TAMBERO` ni `VETERINARIO` no ve Ordeñe, Sanidad, Repro, Entrega, Control lechero ni Retiros; ve supervisión (bomba, service por aprobar, fotos) más Vacas, Máquinas, Service, Avisos, Cuenta y Mis tambos.
- `DUENIO`/`ADMIN` + `TAMBERO`: supervisión **y** las listas de acción de "Hoy", más el menú operativo.
- Tambero o veterinario solos: el menú operativo como hasta ahora (el veterinario no se cambia). Técnico: sin cambios.
- Interruptor **Yo también ordeño** (`PATCH /memberships/me/tambero-role`): solo dueño/admin, sobre la membresía propia. Agrega o quita `TAMBERO` y reemite el JWT. No toca `DUENIO`/`ADMIN` ni otros roles.

### Alta de cuenta (desarrolladora)

- Una cuenta nueva y su primer tambo **solo los crea la desarrolladora** (`POST /admin/tenants` con bloque `tambo`). El dueño no crea cuentas ni tambos. Contraseña inicial: mínimo 8 caracteres, `mustChangePassword = true`.
- El tambo **nunca queda sin proveedor predeterminado**. Al **crear** el tambo tiene que ser una **empresa socia** (`ServiceProvider.tenantId` nulo y `active`). Un proveedor privado o inactivo se rechaza (`400`). Después el dueño o administrador puede dejar como predeterminada una empresa visible de su cuenta (otra socia o una privada propia).
- Si `equipmentProductIds` tiene equipos: nace **en instalación** (`activatedAt` nulo), no se cobra hasta activarlo. Si va vacío: nace **activo**. La corriente (`powerSupply`) es obligatoria si hay equipos.
- El presupuesto se calcula con `computeHardwareBudget` (R1) y se guarda una copia en `Tambo.plannedEquipment` (`productId`, `code`, `name`, `deviceKind`, `quantity`, `unitPrice` nulo si no tenía, `currency`). Un cambio posterior de precios no altera lo presupuestado.
- Agregar un tambo a una cuenta: `POST /admin/tenants/:tenantId/tambos` (mismo bloque; `requestId` opcional para convertir un pedido existente). `POST /admin/tambos` sigue convirtiendo desde un pedido.
- Restablecer clave: `POST /admin/users/:id/reset-password` (desarrolladora). Genera una temporaria de 12 caracteres (o recibe una) y marca `mustChangePassword`. Se muestra **una sola vez**. No hay "olvidé mi clave" por mail.

### Períodos de proveedor

- Cada vez que un tambo nace, se abre un `TamboServiceProviderPeriod` (`startedAt` = ahora). Los tambos que ya existían con proveedor quedaron con un período abierto desde `Tambo.createdAt`.
- Al cambiar `defaultServiceProviderId` (dueño, administrador o desarrolladora), una transacción cierra el período abierto (`endedAt` = ahora) y abre uno nuevo. Si elige el mismo proveedor, no se hace nada. Un solo período abierto por tambo (índice parcial). El dueño no puede elegir una privada de otro tenant.
- Esto habilita la regla de historia: una socia ve el tambo solo en los períodos en que fue proveedora (si el dueño cambia y vuelve, ve esos dos tramos, no el medio). La consulta de historia todavía no filtra; el dato ya está.
- `PATCH /admin/tambos/:id/service-provider` y `GET /admin/tambos/:id/service-provider-periods`.

### Clave obligatoria

- El JWT lleva `mustChangePassword`. Un middleware global responde `403` `{ code: "PASSWORD_CHANGE_REQUIRED" }` a toda ruta autenticada salvo `POST /auth/change-password`, `GET /auth/me` y cierre de sesión.
- `POST /auth/change-password` valida la actual, exige 8 caracteres distinta de la actual, limpia la marca y devuelve un token nuevo. Sirve también para el cambio voluntario.

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

### Catálogo de equipos y presupuesto

- La desarrolladora administra el catálogo (`HardwareProduct`: alta, edición, desactivar; no se borran). Una sola lista de precios. Los precios los carga ella: **sin precio (`unitPrice` nulo) el presupuesto lo dice**. No hay precios por defecto en el seed.
- Reglas de cantidad: `PER_BAJADA` = una por bajada del tambo; `PER_PUMP` = una por cada bomba; `FIXED` = `fixedQuantity` (ej. sensores de tranquera: siempre 4).
- `POST /admin/hardware-products/budget` es **informativo**: no factura ni convierte monedas. Suma por moneda solo las líneas con precio (`missingPrices` si falta alguno). La suscripción mensual se muestra aparte.
- El pedido de tambo del dueño (`POST /tambo-requests` y su `equipment-preview`) no usa este catálogo.

### Dispositivos

- Cada tambo puede tener periféricos (`DeviceKind`: `VACUUM_PUMP_SENSOR`, `FLOW_METER`, `RFID_READER`, `GATE_SENSOR`). `GATE_SENSOR` es **solo registro**: no hay endpoints `/device/*` de datos para él. Los demás `/device/*` autentican con `X-Device-Token` contra `Device.deviceToken`.
- **El dueño no da de alta hardware.** Lo hacen la desarrolladora (`/admin/devices`) o un **técnico autorizado como instalador** (`Membership.canInstallDevices = true`) en los tambos de su alcance (`MembershipTambo`). Ese permiso **solo lo otorga la desarrolladora** (`PATCH /admin/memberships/:id/installer`), y solo si el técnico tiene proveedor formal (`serviceProviderId`); un independiente no se autoriza (`409`). Tener proveedor no alcanza: lo elige el dueño al invitar. El permiso se consulta en la base en cada llamada (revocar vale al toque). Un técnico sin el permiso, el dueño, el tambero y el veterinario solo ven.
- Los dispositivos **no se borran: se retiran** (`retiredAt`). Retirado, o tambo archivado (`Tambo.active = false`), deja de ser aceptado (`403` `DEVICE_RETIRED` / `TAMBO_ARCHIVED`) y no se toca `lastSeenAt`.
- El alta crea el registro y entrega la clave una sola vez (también al rotar). `connected` = reportó en los últimos 5 minutos (`lastSeenAt`).
- `bajadaNumber` obligatorio (1…`Tambo.bajadaCount`) para `FLOW_METER` y `RFID_READER`; nulo para `VACUUM_PUMP_SENSOR` y `GATE_SENSOR`.
- Unicidad de no retirados (`409`): caudalímetro y lector, un solo dispositivo por `(tambo, kind, bajadaNumber)`. Sensor de bomba y sensor de tranquera, un solo dispositivo por `(tambo, kind, label normalizado)` (`lower(btrim(label))`; nulo cuenta como `''`). El primero de ese tipo puede no tener nombre; el siguiente exige `label`. Mensaje: "Ya hay un sensor de bomba/tranquera con ese nombre en el tambo".
- **Limitación conocida:** el panel "Hoy" muestra el estado de la bomba como si hubiera una sola. Con más de una falta un tablero por bomba.

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

## Empresas de service

- **Socias:** catálogo global (`ServiceProvider.tenantId` nulo). Las crea la desarrolladora. El dueño ve nombre, si están activas y si `hasPanel`; **no** ve teléfono ni contacto.
- **Privadas:** las crea el dueño o administrador para su tenant (`POST /service-providers`: nombre 2–80, contacto y teléfono opcionales). Solo las ve esa cuenta. **No tienen cuentas ni panel.** Al crearlas se avisa que no usan CAL; solo las socias (Lobeto Tambos, Omega) pueden gestionar el pedido y enviar informes desde la app.
- `hasPanel` es `false` por defecto. Lo cambia la desarrolladora (`PATCH /admin/service-providers/:id`).
- Un tenant nunca ve ni elige una privada de otro. No se puede desactivar una privada que sea predeterminada de algún tambo (`409` con la lista).

## Cómo se pide el service

- Cada tambo tiene un **proveedor predeterminado**. El pedido va ahí **sin selector**, salvo que un dueño/admin elija otro.
- En el celular, debajo del título: “Se pide a {predeterminada}” y una línea de transparencia (con panel: “Lo ve en su panel.”; sin panel: avisale por WhatsApp).
- Solo `DUENIO`/`ADMIN`: enlace **Pedir service a otro proveedor** (otras socias, privadas propias, “+ Crear otra”). **Solo esta vez** (default) o **Dejarla como predeterminada de este tambo**. El tambero siempre pide al predeterminado; si manda `serviceProviderId` o `makeDefault` en el `POST`, `403`.
- En la web, cambiar el proveedor de un tambo es siempre el predeterminado. “Solo esta vez” existe únicamente al pedir desde el celular.
- `POST /service-requests` acepta `serviceProviderId?` y `makeDefault?`. El proveedor tiene que ser visible y activo (`400` si no). Si `makeDefault` es verdadero, se reutiliza `changeDefaultServiceProvider` en la misma transacción.

## Quién gestiona el estado

- Si `hasPanel` es verdadero: la empresa gestiona el pedido. El dueño/admin **solo puede cancelar los propios**.
- Si `hasPanel` es falso (privadas, y socias hasta el prompt K2): el dueño/admin lleva el pedido por `ACKNOWLEDGED` → `IN_PROGRESS` → `RESOLVED` / `CANCELLED` y anota **quién hizo el servicio** (`performedBy`, texto libre hasta 200) y `resolutionNotes`.
- **Pendiente (prompt K2):** cuentas y panel de las empresas socias.

## Aviso por WhatsApp

- Sin mail. `GET /service-requests/:id/whatsapp-link` arma `https://wa.me/{telefono}?text=...` con tambo, categoría, urgencia, detalle y Maps si hay coordenadas. `404` si la empresa no tiene teléfono.
- `POST /service-requests/:id/mark-notified` guarda `providerNotifiedAt` y `providerNotifyChannel = WHATSAPP`.

## Técnicos individuales

- **Ya no se invitan** desde la pantalla Service. El bloque “Invitar técnico” se sacó de las pantallas. Los endpoints `/memberships/invite-technician` quedan como **legado**, sin borrar.

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
