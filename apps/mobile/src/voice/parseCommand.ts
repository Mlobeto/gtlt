/** Interpreta frases tipo "101 posible mastitis" o "101 celo" (spike voz / Plan B). */

export type HealthVoiceType = "MASTITIS" | "TREATMENT" | "OTHER";
export type ReproVoiceType =
  | "HEAT"
  | "SERVICE"
  | "EXPECTED_CALVING"
  | "CALVING"
  | "ABORTION"
  | "OTHER";

export type ParsedVoiceCommand =
  | {
      kind: "health";
      earTag: string;
      type: HealthVoiceType;
      summary: string;
      raw: string;
      daysWithdrawal: number | null;
      productName?: string;
    }
  | {
      kind: "repro";
      earTag: string;
      type: ReproVoiceType;
      summary: string;
      raw: string;
    };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripWakeWord(text: string): string {
  return text.replace(/\bgtlt\b/gi, " ").replace(/\s+/g, " ").trim();
}

export function containsWakeWord(text: string): boolean {
  return /\bgtlt\b/i.test(text);
}

function parseDays(rest: string): number | null {
  const m = rest.match(/\b(\d{1,2})\s*dias?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseVoiceCommand(text: string): ParsedVoiceCommand | null {
  const raw = text.trim();
  if (!raw) return null;

  const normalized = normalize(stripWakeWord(raw));
  const earMatch = normalized.match(/\b(\d{1,6})\b/);
  if (!earMatch) return null;

  const earTag = earMatch[1];
  const rest = normalized;
  const daysWithdrawal = parseDays(rest);

  if (/\bmastitis\b/.test(rest)) {
    const posible = /\bposible\b/.test(rest);
    return {
      kind: "health",
      earTag,
      type: "MASTITIS",
      summary: posible ? "posible mastitis" : "mastitis",
      raw,
      daysWithdrawal: daysWithdrawal ?? 3,
    };
  }

  if (/\b(tratamiento|remedio|antibiotico|antibioticos)\b/.test(rest)) {
    return {
      kind: "health",
      earTag,
      type: "TREATMENT",
      summary: "tratamiento",
      raw,
      daysWithdrawal: daysWithdrawal ?? 3,
    };
  }

  if (/\b(celo|celos)\b/.test(rest)) {
    return { kind: "repro", earTag, type: "HEAT", summary: "celo", raw };
  }
  if (/\b(servicio|servida|inseminacion)\b/.test(rest)) {
    return { kind: "repro", earTag, type: "SERVICE", summary: "servicio", raw };
  }
  if (/\b(parto estimado|fecha de parto|parto estimado)\b/.test(rest) || /\bparto\s+estimado\b/.test(rest)) {
    return {
      kind: "repro",
      earTag,
      type: "EXPECTED_CALVING",
      summary: "parto estimado",
      raw,
    };
  }
  if (/\bparto\b/.test(rest)) {
    return { kind: "repro", earTag, type: "CALVING", summary: "parto", raw };
  }
  if (/\baborto\b/.test(rest)) {
    return { kind: "repro", earTag, type: "ABORTION", summary: "aborto", raw };
  }

  return {
    kind: "health",
    earTag,
    type: "OTHER",
    summary: "evento sanitario",
    raw,
    daysWithdrawal,
  };
}
