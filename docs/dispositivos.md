# Dispositivos

Periféricos de un tambo: sensor de relé de la bomba de vacío, caudalímetro por bajada y lector de caravanas. La clave (`deviceToken`) autentica los endpoints `/device/*`. **No se guarda en el repo ni se vuelve a mostrar** después del alta o de rotarla.

## Quién puede qué

| Acción | Quién |
|---|---|
| Ver la lista | Dueño, tambero, veterinario, admin del tenant, técnico con acceso al tambo |
| Instalar, retirar, rotar clave | **Desarrolladora** (cualquier tambo) o **técnico autorizado como instalador** (`Membership.canInstallDevices`, solo lo otorga la desarrolladora) en los tambos de su `MembershipTambo` |
| Técnico sin ese permiso (con o sin proveedor) | Solo lectura |

El dueño no da de alta hardware. Tener `serviceProviderId` no alcanza: ese dato lo elige el dueño al invitar. Un independiente nunca se autoriza (`409`). Un técnico de otro tambo recibe `403` / `404`. La desarrolladora marca el permiso en Cuentas → **Autorizado a instalar hardware**. Revocarlo vale al instante (se lee de la base en cada llamada).

Los dispositivos **no se borran: se retiran** (`retiredAt`). Un dispositivo retirado responde `403` `DEVICE_RETIRED`. Si el tambo está archivado (`Tambo.active = false`), responde `403` `TAMBO_ARCHIVED`. En esos casos no se actualiza `lastSeenAt`.

## Cómo se instala (paso a paso)

1. En la vista del tambo del técnico (web o mobile), sección **Dispositivos** → **Instalar dispositivo**.
2. Elegí tipo. Caudalímetro y lector piden bajada (`1` … `Tambo.bajadaCount`). El sensor de bomba no usa bajada y es **uno solo** por tambo.
3. Al crear, la API entrega la clave **una sola vez**. Copiala (web) o compartila (mobile) y cargala en el aparato.
4. El ítem queda en **Esperando primer contacto** hasta el primer `POST /device/…` con esa clave.
5. Si reportó en los últimos 5 minutos: **Conectado · hace N min**. Si ya reportó pero hace más: **Sin señal desde …**.
6. **Nueva clave** invalida la anterior; el aparato deja de autenticarse hasta cargarle la nueva. **Retirar** lo da de baja.

Rutas: `GET/POST /devices` (incluye `canManage`), `POST /devices/:id/rotate-token`, `POST /devices/:id/retire`. La desarrolladora usa las mismas bajo `/admin/devices`, y autoriza instaladores con `GET /admin/installers?tenantId=` y `PATCH /admin/memberships/:id/installer`.

## Simulador

Habla solo con `/device/*` (no escribe en la base directo). **Escribe datos reales** en la API a la que apunte `API_URL`.

```powershell
cd apps/api
$env:API_URL = "https://gtlt-api.proudmoss-fef6994b.eastus2.azurecontainerapps.io"
$env:DEVICE_TOKEN = "<clave-del-alta>"
npx tsx src/scripts/simulate-device.ts pump --days 2
npx tsx src/scripts/simulate-device.ts flow --bajada 1
```

También: `npm run simulate -- pump --days 2`.

- `pump`: hoy y los N-1 días anteriores, dos tramos ON (mañana ~05:00–07:20 y tarde ~16:30–18:40, ART UTC-3, ±15 min). No manda eventos a futuro; si el tramo está en curso, solo el `ON`.
- `flow --bajada N`: abre sesión, ~40 pulsos (ordeñe) y cierra.

Si el dispositivo está retirado o el tambo archivado, el simulador sale con código distinto de 0 (`403`).
