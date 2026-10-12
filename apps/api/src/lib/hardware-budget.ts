export type QuantityRule = "PER_BAJADA" | "PER_PUMP" | "FIXED";

export type HardwareBudgetProduct = {
  id: string;
  name: string;
  quantityRule: QuantityRule;
  fixedQuantity: number | null;
  unitPrice: unknown;
  currency: string;
  active: boolean;
};

export type HardwareBudgetLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  subtotal: number | null;
  currency: string;
};

export type HardwareBudget = {
  lines: HardwareBudgetLine[];
  totalsByCurrency: Record<string, number>;
  missingPrices: boolean;
};

function toMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : typeof value === "object" && value !== null && "toString" in value
          ? Number(String(value))
          : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return round2(n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function quantityFor(product: HardwareBudgetProduct, bajadaCount: number, pumpCount: number): number {
  if (product.quantityRule === "PER_BAJADA") return bajadaCount;
  if (product.quantityRule === "PER_PUMP") return pumpCount;
  return product.fixedQuantity ?? 0;
}

export function computeHardwareBudget({
  products,
  selectedProductIds,
  bajadaCount,
  pumpCount,
}: {
  products: HardwareBudgetProduct[];
  selectedProductIds: string[];
  bajadaCount: number;
  pumpCount: number;
}): HardwareBudget {
  const byId = new Map(products.filter((p) => p.active).map((p) => [p.id, p]));
  const lines: HardwareBudgetLine[] = [];
  const totals = new Map<string, number>();
  let missingPrices = false;

  for (const id of selectedProductIds) {
    const product = byId.get(id);
    if (!product) continue;

    const quantity = quantityFor(product, bajadaCount, pumpCount);
    const unitPrice = toMoney(product.unitPrice);
    const subtotal = unitPrice == null ? null : round2(unitPrice * quantity);
    if (unitPrice == null) {
      missingPrices = true;
    } else if (subtotal != null) {
      totals.set(product.currency, round2((totals.get(product.currency) ?? 0) + subtotal));
    }

    lines.push({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      subtotal,
      currency: product.currency,
    });
  }

  return {
    lines,
    totalsByCurrency: Object.fromEntries(totals),
    missingPrices,
  };
}
