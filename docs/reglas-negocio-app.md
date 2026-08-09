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

## Correcciones append-only

Aplica a `MilkingSession`, `ControlLechero` (header) y `MilkDelivery`:

1. Marcar el registro previo `status = VOIDED`.
2. Insertar uno nuevo `ACTIVE` con `corrects*Id` apuntando al anulado.
3. `ControlLecheroLine` no se corrige sola: al corregir un control se anula el header y se crean líneas nuevas bajo el header nuevo.

## Membership / tambos

- `DUENIO` o `ADMIN` → acceso a todos los tambos del tenant.
- Solo `TAMBERO` / `VETERINARIO` → alcance = filas de `MembershipTambo`.
