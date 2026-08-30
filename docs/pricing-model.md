# GTLT — Modelo de suscripción y planes

**Última actualización:** 2026-08-30
**Estado:** modelo de datos implementado (`Plan`/`Subscription`/`Payment`); venta y checkout todavía manuales.

Complementa [arquitectura.md §6.1](./arquitectura.md) y [reglas-negocio-app.md](./reglas-negocio-app.md).

---

## 1. Planes

| Plan | Código | Precio | Recurrencia | Quién lo asigna |
|---|---|---|---|---|
| Estándar | `STANDARD` | **USD 21 fijo** — convertido a ARS automáticamente (ver §5) | Mensual (Mercado Pago Suscripciones, a futuro) | Autoservicio (futuro) o la desarrolladora manualmente (hoy) |
| Lifetime | `LIFETIME` | $0 | Sin recurrencia | Solo la desarrolladora, a mano, para tenants elegidos (cortesía) |

Un tenant tiene **una sola suscripción** activa a la vez (`Subscription.tenantId` único).

## 2. Flujo comercial actual (hoy — manual)

1. La venta se hace personalmente (fuera de la app).
2. La desarrolladora crea el `Tenant` + el `User` dueño (rol `DUENIO`) + `Membership` a mano (vía seed/Prisma Studio o, a futuro, desde el panel de dev).
3. Se le entregan las credenciales al dueño del tambo.
4. El dueño entra a la web/mobile y configura su cuenta: activa tamberos (pendiente, ver `reglas-negocio-app.md`), tambos, etc.

## 3. Flujo comercial futuro (planeado, NO implementado)

1. Comprador visita la landing pública (no existe todavía) y elige el plan `STANDARD`.
2. Paga vía **Mercado Pago Suscripciones** (pago recurrente).
3. Mercado Pago confirma el pago vía webhook a la API.
4. La API crea automáticamente: `Tenant` + `User` (rol `DUENIO`) + `Membership` + `Subscription` (`STANDARD`/`ACTIVE`) + `Payment`.
5. Se envían las credenciales generadas al comprador (email/WhatsApp).
6. El dueño entra y configura su cuenta como en el flujo manual.

**No implementado en esta ronda:** landing pública, checkout, webhook de Mercado Pago, generación/envío de credenciales, gating de acceso si el pago falla o se cancela (`PAST_DUE`/`CANCELED`).

## 4. Cliente de referencia (para copy de landing)

- **Lobeto Tambos** — Lincoln, Pcia. de Buenos Aires.
- Tel: 2355570596
- Web: lobetotambos.com.ar

## 5. Modelo de datos

Ver `apps/api/prisma/schema.prisma`:

- `Plan` — catálogo de planes (`code`, `name`, `priceUsd` nullable, `priceArs`, `fxRate`, `fxRateSource`, `priceArsUpdatedAt`, `billingIntervalMonths` nullable = sin recurrencia, `active`).
- `Subscription` — 1 por tenant (`tenantId` único), referencia a `Plan`, `status` (`ACTIVE`/`PAST_DUE`/`CANCELED`), `startedAt`, `currentPeriodEnd` (null para lifetime), `mpSubscriptionId` (nullable, para Mercado Pago a futuro).
- `Payment` — historial de pagos por tenant/suscripción, `provider` (`MERCADOPAGO`/`MANUAL`), `externalId` (id de pago de Mercado Pago), `amountArs`, `status`, `paidAt`, `notes` (para ventas manuales).

El estado de acceso de un tenant se deriva de `Subscription.status` — no hay un flag redundante `Tenant.active`.

## 6. Precio en USD y actualización automática a pesos

El plan `STANDARD` se fija en **USD 21** (`Plan.priceUsd`). Mercado Pago cobra en pesos, y el valor del dólar en Argentina cambia seguido, así que `Plan.priceArs` es un **precio cacheado que se recalcula automáticamente** para mantenerse equivalente a USD 21:

- **Fuente de la cotización:** dólar **oficial**, valor "venta", vía la API pública [dolarapi.com](https://dolarapi.com) (sin API key) — `apps/api/src/lib/exchange-rate.ts`.
- **Cálculo:** `priceArs = round(priceUsd * ventaOficial)` — `apps/api/src/lib/plan-pricing.ts` (`syncPlanPricesFromUsd`). Solo toca planes con `priceUsd` definido (no afecta `LIFETIME`).
- **Frecuencia:** automático, 1 vez por día mientras el proceso de la API esté corriendo (`apps/api/src/lib/plan-price-scheduler.ts`, arrancado desde `index.ts`). También corre una vez al iniciar el servidor.
- **Trigger manual:** `npm run sync:plan-prices` (dentro de `apps/api`) para forzar un recalculo puntual (útil si el servidor estuvo mucho tiempo apagado o para verificar el valor antes de una venta).
- Cada plan guarda `fxRate` (cotización usada) y `priceArsUpdatedAt` (cuándo se actualizó por última vez) para auditoría.
- **Limitación conocida:** el scheduler es *in-process* (`setInterval`); si la API corre en un entorno serverless (sin proceso persistente) hay que reemplazarlo por un cron externo que llame a `npm run sync:plan-prices` o a un endpoint dedicado — pendiente si se cambia el modelo de deploy de la API.

## 7. Abierto / pendiente

- [ ] ¿Hay período de prueba gratuito antes de cobrar?
- [ ] Panel de dev: alta/edición de tenants, ver/editar pagos, estadísticas (backlog).
- [ ] Landing pública + checkout Mercado Pago Suscripciones + webhook (backlog).
- [ ] Gating real de acceso cuando `Subscription.status != ACTIVE` (backlog).
- [ ] Si la API se despliega en un entorno sin proceso persistente (serverless), reemplazar el scheduler in-process por un cron externo.
