import { z } from "zod";
import { HttpError } from "./http-error.js";

export type QuoteItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
};

export type ValidatedTamboQuote = {
  quoteItems: QuoteItem[];
  quoteTotal: number;
  quoteCurrency: string;
  quoteValidUntil: Date | null;
  quoteNotes: string | null;
};

const quoteItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().positive().finite(),
  unitPrice: z.number().nonnegative().finite(),
  currency: z.string().trim().min(3).max(8),
});

const quoteSchema = z.object({
  quoteItems: z.array(quoteItemSchema).min(1),
  quoteTotal: z.number().nonnegative().finite(),
  quoteCurrency: z.string().trim().min(3).max(8),
  quoteValidUntil: z.string().datetime().optional().nullable(),
  quoteNotes: z.string().trim().max(2000).optional().nullable(),
});

/**
 * Validación de cotización reutilizable (prompt K: panel del proveedor).
 * La desarrolladora la usa hoy en nombre del proveedor.
 */
export function validateTamboQuote(input: unknown): ValidatedTamboQuote {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, "Cotización inválida", "INVALID_QUOTE", {
      details: parsed.error.flatten(),
    });
  }

  const currency = parsed.data.quoteCurrency.toUpperCase();
  for (const item of parsed.data.quoteItems) {
    if (item.currency.toUpperCase() !== currency) {
      throw new HttpError(
        400,
        "Todos los ítems de la cotización deben usar la misma moneda.",
        "INVALID_QUOTE",
      );
    }
  }

  const sum = parsed.data.quoteItems.reduce(
    (acc, item) => acc + item.quantity * item.unitPrice,
    0,
  );
  if (Math.abs(sum - parsed.data.quoteTotal) > 0.05) {
    throw new HttpError(
      400,
      "El total de la cotización no coincide con la suma de los ítems.",
      "INVALID_QUOTE",
    );
  }

  return {
    quoteItems: parsed.data.quoteItems.map((item) => ({
      ...item,
      currency: item.currency.toUpperCase(),
    })),
    quoteTotal: parsed.data.quoteTotal,
    quoteCurrency: currency,
    quoteValidUntil: parsed.data.quoteValidUntil
      ? new Date(parsed.data.quoteValidUntil)
      : null,
    quoteNotes: parsed.data.quoteNotes?.trim() || null,
  };
}
