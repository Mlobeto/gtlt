export const PHONE_INVALID_MESSAGE =
  "Revisá el número: código de área y número, sin 0 ni 15 (por ejemplo, 351 6123456)";

export type NormalizeEmailResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

export type NormalizePhoneResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

export type ParseIdentifierResult =
  | { ok: true; kind: "email" | "phone"; value: string }
  | { ok: false; reason: string };

export function normalizeEmail(raw: string | null | undefined): NormalizeEmailResult {
  if (raw == null) return { ok: false, reason: "empty" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (/\s/.test(trimmed)) return { ok: false, reason: "spaces" };
  const value = trimmed.toLowerCase();
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@") || at === value.length - 1) {
    return { ok: false, reason: "format" };
  }
  return { ok: true, value };
}

function compactPhone(raw: string): string {
  return raw.replace(/[\s.\-()]/g, "");
}

function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function normalizePhone(raw: string | null | undefined): NormalizePhoneResult {
  if (raw == null) return { ok: false, reason: PHONE_INVALID_MESSAGE };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: PHONE_INVALID_MESSAGE };
  const compact = compactPhone(trimmed);
  if (!compact) return { ok: false, reason: PHONE_INVALID_MESSAGE };

  if (compact.startsWith("+") && !compact.startsWith("+54")) {
    const rest = compact.slice(1);
    if (!/^\d+$/.test(rest) || rest.length < 8 || rest.length > 15) {
      return { ok: false, reason: PHONE_INVALID_MESSAGE };
    }
    return { ok: true, value: `+${rest}` };
  }

  let digits = onlyDigits(compact);
  if (!digits) return { ok: false, reason: PHONE_INVALID_MESSAGE };

  if (digits.startsWith("0054")) digits = digits.slice(4);
  else if (digits.startsWith("54")) digits = digits.slice(2);

  if (digits.startsWith("0")) digits = digits.slice(1);

  if (digits.length === 11 && digits.startsWith("9")) digits = digits.slice(1);

  if (digits.length === 12) {
    const candidates: number[] = [];
    for (const pos of [2, 3, 4]) {
      if (digits.slice(pos, pos + 2) === "15") candidates.push(pos);
    }
    if (candidates.length > 1) return { ok: false, reason: PHONE_INVALID_MESSAGE };
    if (candidates.length === 1) {
      const i = candidates[0]!;
      digits = digits.slice(0, i) + digits.slice(i + 2);
    }
  }

  if (digits.length !== 10 || !/^\d{10}$/.test(digits)) {
    return { ok: false, reason: PHONE_INVALID_MESSAGE };
  }
  return { ok: true, value: `+549${digits}` };
}

export function parseIdentifier(raw: string | null | undefined): ParseIdentifierResult {
  if (raw == null) return { ok: false, reason: "empty" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.includes("@")) {
    const email = normalizeEmail(trimmed);
    if (!email.ok) return { ok: false, reason: email.reason };
    return { ok: true, kind: "email", value: email.value };
  }
  const phone = normalizePhone(trimmed);
  if (!phone.ok) return { ok: false, reason: phone.reason };
  return { ok: true, kind: "phone", value: phone.value };
}
