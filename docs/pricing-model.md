# GTLT — Modelo de suscripción y planes

**Última actualización:** 2026-08-30
**Estado:** modelo de datos implementado (`Plan`/`Subscription`/`Payment`); venta y checkout todavía manuales.

Complementa [arquitectura.md §6.1](./arquitectura.md) y [reglas-negocio-app.md](./reglas-negocio-app.md).

---

## 1. Planes

| Plan | Código | Precio | Recurrencia | Quién lo asigna |
|---|---|---|---|---|
| Estándar | `STANDARD` | A definir (ARS) — placeholder en seed | Mensual (Mercado Pago Suscripciones, a futuro) | Autoservicio (futuro) o la desarrolladora manualmente (hoy) |
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

- `Plan` — catálogo de planes (`code`, `name`, `priceArs`, `billingIntervalMonths` nullable = sin recurrencia, `active`).
- `Subscription` — 1 por tenant (`tenantId` único), referencia a `Plan`, `status` (`ACTIVE`/`PAST_DUE`/`CANCELED`), `startedAt`, `currentPeriodEnd` (null para lifetime), `mpSubscriptionId` (nullable, para Mercado Pago a futuro).
- `Payment` — historial de pagos por tenant/suscripción, `provider` (`MERCADOPAGO`/`MANUAL`), `externalId` (id de pago de Mercado Pago), `amountArs`, `status`, `paidAt`, `notes` (para ventas manuales).

El estado de acceso de un tenant se deriva de `Subscription.status` — no hay un flag redundante `Tenant.active`.

## 6. Abierto / pendiente

- [ ] Precio exacto (ARS) del plan `STANDARD`.
- [ ] ¿Hay período de prueba gratuito antes de cobrar?
- [ ] Panel de dev: alta/edición de tenants, ver/editar pagos, estadísticas (backlog).
- [ ] Landing pública + checkout Mercado Pago Suscripciones + webhook (backlog).
- [ ] Gating real de acceso cuando `Subscription.status != ACTIVE` (backlog).
