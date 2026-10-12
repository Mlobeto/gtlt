import { computeHardwareBudget } from "../lib/hardware-budget.js";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function same(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${label}: esperado ${e}, obtuvo ${a}`);
}

const flow = {
  id: "flow",
  name: "Caudalímetro",
  quantityRule: "PER_BAJADA" as const,
  fixedQuantity: null,
  unitPrice: null,
  currency: "USD",
  active: true,
};
const reader = {
  id: "reader",
  name: "Lector de caravanas",
  quantityRule: "PER_BAJADA" as const,
  fixedQuantity: null,
  unitPrice: 10,
  currency: "USD",
  active: true,
};
const pump = {
  id: "pump",
  name: "Monitoreo de bomba de vacío",
  quantityRule: "PER_PUMP" as const,
  fixedQuantity: null,
  unitPrice: 50,
  currency: "USD",
  active: true,
};
const gate = {
  id: "gate",
  name: "Sensor de tranquera",
  quantityRule: "FIXED" as const,
  fixedQuantity: 4,
  unitPrice: 20,
  currency: "USD",
  active: true,
};
const ars = {
  id: "ars",
  name: "Pieza en pesos",
  quantityRule: "FIXED" as const,
  fixedQuantity: 1,
  unitPrice: 1000,
  currency: "ARS",
  active: true,
};
const inactive = {
  id: "old",
  name: "Descontinuado",
  quantityRule: "PER_BAJADA" as const,
  fixedQuantity: null,
  unitPrice: 99,
  currency: "USD",
  active: false,
};

const eight = computeHardwareBudget({
  products: [flow, reader, pump, gate, ars, inactive],
  selectedProductIds: ["flow", "reader", "pump", "gate"],
  bajadaCount: 8,
  pumpCount: 2,
});

same(
  eight.lines.map((l) => ({ id: l.productId, q: l.quantity, price: l.unitPrice, sub: l.subtotal })),
  [
    { id: "flow", q: 8, price: null, sub: null },
    { id: "reader", q: 8, price: 10, sub: 80 },
    { id: "pump", q: 2, price: 50, sub: 100 },
    { id: "gate", q: 4, price: 20, sub: 80 },
  ],
  "8 bajadas / 2 bombas / tranqueras fijas",
);
assert(eight.missingPrices === true, "producto sin precio debe marcar missingPrices");
same(eight.totalsByCurrency, { USD: 260 }, "totales solo líneas con precio");

const twoCurrencies = computeHardwareBudget({
  products: [reader, ars],
  selectedProductIds: ["reader", "ars"],
  bajadaCount: 8,
  pumpCount: 1,
});
same(twoCurrencies.totalsByCurrency, { USD: 80, ARS: 1000 }, "no convierte monedas");
assert(twoCurrencies.missingPrices === false, "ambas con precio");

const ignored = computeHardwareBudget({
  products: [reader, inactive],
  selectedProductIds: ["reader", "old"],
  bajadaCount: 8,
  pumpCount: 1,
});
assert(ignored.lines.length === 1 && ignored.lines[0].productId === "reader", "ignora inactivos");

const zeroBajadas = computeHardwareBudget({
  products: [flow, reader],
  selectedProductIds: ["flow", "reader"],
  bajadaCount: 0,
  pumpCount: 1,
});
same(
  zeroBajadas.lines.map((l) => l.quantity),
  [0, 0],
  "0 bajadas es válido en la función (el 400 lo pone el endpoint)",
);

console.log("verify-hardware-budget: ok");
console.log(JSON.stringify({ eight, twoCurrencies, ignored, zeroBajadas }, null, 2));
