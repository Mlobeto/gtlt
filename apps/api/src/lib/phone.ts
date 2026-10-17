import { HttpError } from "./http-error.js";

const DEFAULT_COUNTRY = "54";

/** Solo dígitos, país 54 por defecto, y el 9 de celular argentino para wa.me. */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    throw new HttpError(400, "El teléfono no es válido.");
  }
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!digits) {
    throw new HttpError(400, "El teléfono no es válido.");
  }

  if (!digits.startsWith(DEFAULT_COUNTRY)) {
    digits = DEFAULT_COUNTRY + digits;
  }

  let rest = digits.slice(DEFAULT_COUNTRY.length);
  if (rest.startsWith("0")) rest = rest.slice(1);
  // 15 de celular viejo después del código de área de 2 dígitos (11, 15 → 9 11)
  rest = rest.replace(/^(\d{2,4})15/, "$1");
  if (!rest.startsWith("9")) {
    rest = "9" + rest;
  }

  digits = DEFAULT_COUNTRY + rest;
  if (digits.length < 11 || digits.length > 15) {
    throw new HttpError(
      400,
      "El teléfono tiene que ser un celular con código de país (ej. 5491112345678).",
    );
  }
  return digits;
}

export function whatsappChatUrl(phoneDigits: string, text: string) {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}
