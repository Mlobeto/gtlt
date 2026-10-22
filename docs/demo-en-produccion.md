# Datos de demostración en producción

Esta cuenta es **real** en el entorno donde corra el script, aunque el nombre lleve `[DEMO]`. Sirve para mostrar la app con historia (animales, partos, ordeñes, entregas). No es un “modo prueba” aparte.

## Qué crea

- La cuenta **`[DEMO] Tambos del Sur`**, dueño **Dueño Demo**.
- El proveedor socio **`[DEMO] Servicio de prueba`** (sin panel). No usa empresas reales.
- Dos tambos: **Los Ceibos** (8 bajadas, trifásica, umbral de diferencia 3 %) y **La Aurora** (6 bajadas, monofásica, sin umbral).
- Plan **LIFETIME** (vitalicio): en el código de cobro ese plan es cortesía y **no genera importe**.
- Por tambo: 25 vacas (caravanas 1001–1025 / 2001–2025) + un toro propio (1900 / 2900), genealogía, servicios y partos, 4 eventos de sanidad (2 con retiro de leche vigente), pesadas de terneras, 3 controles lecheros, ordeñes de 45 días (faltan 3 turnos a propósito) y entregas cada ~2 días.

El script entra como desarrolladora, crea o reutiliza la cuenta por las rutas de administración, cambia la clave inicial del dueño (sin mostrarla) y carga el resto **como dueño**, por HTTP. No habla con la base de datos.

## Qué no crea

Pedidos de service, avisos, dispositivos, equipos, fotos, piezas ni informes de trabajo. **No le cargues pedidos de service** a esta cuenta: el proveedor de prueba no es una empresa real y no debe recibir notificaciones.

## Cómo reconocerlo

Todo el nombre de la cuenta empieza por `[DEMO]`. El proveedor también.

## Cómo correrlo (PowerShell)

Desde `apps/api`. Las claves se piden en el momento, no se guardan en archivos. `Read-Host -AsSecureString` evita que queden en el historial de la consola.

```powershell
cd apps\api

$secDev = Read-Host "Clave de la desarrolladora" -AsSecureString
$secOwner = Read-Host "Clave final del dueño demo (mín. 8)" -AsSecureString
$bstrDev = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secDev)
$bstrOwner = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secOwner)

$env:CAL_API_URL = "https://TU-API"
$env:CAL_DEV_EMAIL = "desarrolladora@tu-dominio"
$env:CAL_DEV_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstrDev)
$env:CAL_DEMO_OWNER_EMAIL = "dueno-demo@tu-dominio"
$env:CAL_DEMO_OWNER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstrOwner)

[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstrDev)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstrOwner)

npx tsx src/scripts/seed-demo-prod.ts

Remove-Item Env:CAL_API_URL, Env:CAL_DEV_EMAIL, Env:CAL_DEV_PASSWORD, Env:CAL_DEMO_OWNER_EMAIL, Env:CAL_DEMO_OWNER_PASSWORD -ErrorAction SilentlyContinue
```

El script imprime el host del API y el plan de carga, y **no escribe nada** hasta que tipees exactamente `CARGAR DEMO`.

### Solo ver el plan (sin red)

```powershell
cd apps\api
npx tsx src/scripts/seed-demo-prod.ts --dry-run
```

### Comprobar el generador (sin red)

```powershell
cd apps\api
npx tsx src/scripts/verify-seed-demo.ts
```

## Cómo se repite sin duplicar

Si la cuenta, el proveedor o los tambos ya existen (se buscan por nombre), se reutilizan. Animales y registros llevan un id fijo (UUID v5) y `clientMutationId`; un 409 de duplicado se cuenta como “ya estaba”. Los toros externos se buscan por código (`DEMO-A`, `DEMO-B`, `DEMO-C`) porque esa ruta no tiene idempotencia.

## Cómo se archiva

Hay ruta de dueño `PATCH /tambos/:tamboId/active` con `{ "active": false }`. El script la usa con:

```powershell
# mismas variables que arriba, y después:
npx tsx src/scripts/seed-demo-prod.ts --archive
```

Pedirá `ARCHIVAR DEMO`.

**Tope del producto:** no se puede archivar el último tambo activo de la cuenta (responde 409). El script archiva los dos en orden; el segundo va a fallar si queda como último. Pasos en el panel:

1. Entrá como dueño de `[DEMO] Tambos del Sur`.
2. Archivá **Los Ceibos**.
3. El último (**La Aurora**) no se puede archivar por esa regla: o se deja inactivo el uso de la cuenta, o se da de alta otro tambo real y recién ahí se archiva La Aurora.
4. No borres el proveedor `[DEMO] Servicio de prueba` si otras cuentas no lo usan; si solo lo usa esta demo, se puede desactivar desde administración (`active: false`), no hay ruta de borrado.

No hay ruta de administración específica “archivar tambo de demo”.

## Advertencias

- Es una **cuenta real**. Quien tenga el correo y la clave del dueño entra como cualquier cliente.
- El nombre `[DEMO]` es la señal para no confundirla con un cliente.
- No le cargues pedidos de service ni vincules empresas reales (Lobeto, Omega, u otras).
- Nunca dejes las variables de entorno ni las claves en un archivo, en el chat ni en el historial.
