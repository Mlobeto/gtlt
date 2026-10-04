import type { PartReplacementPattern } from "@prisma/client";

/** Dos turnos de ordeñe por día (mañana y tarde). */
export const MILKINGS_PER_DAY = 2;

/** Días promedio por mes para la regla por tiempo. */
export const DAYS_PER_MONTH = 30.44;

export type PartLifeStatus = "OK" | "SOON" | "OVERDUE";
export type UsageSource = "COUNTED" | "ESTIMATED";

export type PartLifeRule = {
  percent: number;
  estimatedReplacementDate: string | null;
};

export type PartLifeByUsage = PartLifeRule & {
  milkings: number;
  threshold: number;
  usageSource: UsageSource;
};

export type PartLifeByTime = PartLifeRule & {
  days: number;
  lifeDays: number;
  lifeMonths: number;
};

export type PartLifeNone = { kind: "NONE" };

export type PartLifePlanned = {
  kind: "USAGE_BASED";
  status: PartLifeStatus;
  percent: number;
  usageSource?: UsageSource;
  byUsage?: PartLifeByUsage;
  byTime?: PartLifeByTime;
  estimatedReplacementDate: string | null;
};

export type PartLifeResult = PartLifeNone | PartLifePlanned;

export type EstimatePartLifeInput = {
  pattern: PartReplacementPattern | string;
  usageThreshold: number | null;
  lifeMonths: number | null;
  installedAt: Date;
  usageCounter: number | null;
  activeCows: number;
  bajadaCount: number;
  now: Date;
};

function wholeDaysSince(installedAt: Date, now: Date): number {
  const start = Date.UTC(
    installedAt.getUTCFullYear(),
    installedAt.getUTCMonth(),
    installedAt.getUTCDate(),
  );
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

function statusFromPercent(percent: number): PartLifeStatus {
  if (percent >= 1) return "OVERDUE";
  if (percent >= 0.8) return "SOON";
  return "OK";
}

function dateOrNullIfPast(date: Date, now: Date): string | null {
  return date.getTime() <= now.getTime() ? null : date.toISOString();
}

export function estimatePartLife(input: EstimatePartLifeInput): PartLifeResult {
  const usageThreshold =
    input.usageThreshold != null && input.usageThreshold > 0 ? input.usageThreshold : null;
  const lifeMonths = input.lifeMonths != null && input.lifeMonths > 0 ? input.lifeMonths : null;

  if (input.pattern !== "USAGE_BASED" || (!usageThreshold && !lifeMonths)) {
    return { kind: "NONE" };
  }

  const days = wholeDaysSince(input.installedAt, input.now);
  let byUsage: PartLifeByUsage | undefined;
  let byTime: PartLifeByTime | undefined;

  if (usageThreshold) {
    const bajadas = input.bajadaCount > 0 ? input.bajadaCount : 1;
    const rate = (MILKINGS_PER_DAY * Math.max(0, input.activeCows)) / bajadas;
    const usageSource: UsageSource = input.usageCounter != null ? "COUNTED" : "ESTIMATED";
    const milkings =
      input.usageCounter != null ? input.usageCounter : Math.round(days * rate);
    const percent = milkings / usageThreshold;
    const daysUntil = rate > 0 ? (usageThreshold - milkings) / rate : null;
    const rawDate =
      daysUntil == null ? null : addDays(input.now, daysUntil);
    byUsage = {
      percent,
      milkings,
      threshold: usageThreshold,
      usageSource,
      estimatedReplacementDate: rawDate ? dateOrNullIfPast(rawDate, input.now) : null,
    };
  }

  if (lifeMonths) {
    const lifeDays = lifeMonths * DAYS_PER_MONTH;
    const percent = days / lifeDays;
    const rawDate = addDays(input.installedAt, lifeDays);
    byTime = {
      percent,
      days,
      lifeDays,
      lifeMonths,
      estimatedReplacementDate: dateOrNullIfPast(rawDate, input.now),
    };
  }

  const percent = Math.max(byUsage?.percent ?? 0, byTime?.percent ?? 0);
  const candidates = [byUsage?.estimatedReplacementDate, byTime?.estimatedReplacementDate]
    .filter((d): d is string => Boolean(d))
    .sort();

  return {
    kind: "USAGE_BASED",
    status: statusFromPercent(percent),
    percent,
    usageSource: byUsage?.usageSource,
    byUsage,
    byTime,
    estimatedReplacementDate: candidates[0] ?? null,
  };
}
