# GTLT mobile — spike offline

Spike de **offline-first** para el tambero:

1. Login contra `apps/api`
2. Pull de animales + retiros vigentes a **SQLite** (`expo-sqlite`)
3. Alta de `HealthEvent` **siempre local** (outbox)
4. Sync push/pull cuando hay red

> WatermelonDB queda como candidata de producción; este spike usa SQLite + outbox propia para validar el protocolo rápido.

## Requisitos

- API corriendo: `cd apps/api && npm run dev`
- Animal demo en el tambo (ej. caravana `101`) — ya se puede crear por API

## Config API URL

Por defecto: `http://localhost:3001`

```powershell
# Expo web / simulador iOS
$env:EXPO_PUBLIC_API_URL="http://localhost:3001"

# Emulador Android
$env:EXPO_PUBLIC_API_URL="http://10.0.2.2:3001"

# Celular físico (misma WiFi que la PC)
$env:EXPO_PUBLIC_API_URL="http://192.168.x.x:3001"
```

## Correr

```powershell
cd apps\mobile
npm start
# luego `w` (web) o Expo Go
```

## Flujo de prueba

1. Login: `admin@gtlt.local` / `demo1234`
2. Modo avión / sin red → **Guardar local** un tratamiento
3. Debe aparecer en “Retiros vigentes” con `PENDING`
4. Volver online → **Sync**
5. `pending` baja a 0; el evento queda en Postgres (`/health-events/active-withdrawals`)
