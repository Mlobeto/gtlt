/** Gestación bovina típica — aproximación para UI (no diagnóstico). Igual que el celular. */
export const GESTATION_DAYS = 280;
export const CALVING_SOON_DAYS = 30;
export const CALVING_OVERDUE_DAYS = 15;
export const DRY_OFF_DAYS_BEFORE_CALVING = 60;
export const PREG_CHECK_MIN_DAYS = 30;
export const PREG_CHECK_MAX_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReproEventLike = {
  type: string;
  eventAt: string;
  expectedCalvingAt?: string | null;
};

export type PregnancyInsight = {
  pregnant: boolean;
  servedAt: string | null;
  expectedCalvingAt: string | null;
  lastCalvingAt: string | null;
  lastAbortionAt: string | null;
};

export type AnimalAlert = {
  code: "DRY_OFF" | "CALVING_SOON" | "CALVING_OVERDUE" | "PREGNANCY_CHECK" | "MILK_WITHDRAWAL";
  daysDelta: number;
  date: string;
};

export type LactationInsight = {
  lactationNumber: number;
  lastCalvingAt: string | null;
  daysInMilk: number | null;
};

/** Día calendario UTC (ms a las 00:00 UTC) de un `YYYY-MM-DD` o ISO completo. */
export function utcDay(value: string | Date): number {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  }
  const date = typeof value === "string" ? new Date(value) : value;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function daysBetween(from: string | Date, to: string | Date): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function argentinaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Resume preñez a partir de eventos repro (sin entidad aparte).
 * Misma lógica que `apps/mobile/src/animals/pregnancy.ts`.
 */
export function derivePregnancy(events: ReproEventLike[]): PregnancyInsight {
  const asc = [...events].sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  const desc = [...asc].reverse();

  const lastService = desc.find((e) => e.type === "SERVICE") ?? null;
  const lastCalving = desc.find((e) => e.type === "CALVING") ?? null;
  const lastAbortion = desc.find((e) => e.type === "ABORTION") ?? null;

  let pregnant = false;
  let expectedCalvingAt: string | null = null;

  if (lastService) {
    const afterService = asc.filter((e) => e.eventAt >= lastService.eventAt);
    const ended = afterService.find((e) => e.type === "CALVING" || e.type === "ABORTION");
    pregnant = !ended;

    if (pregnant) {
      const explicit = afterService
        .filter((e) => e.type === "EXPECTED_CALVING" || e.expectedCalvingAt)
        .reverse()[0];
      expectedCalvingAt =
        explicit?.expectedCalvingAt ??
        lastService.expectedCalvingAt ??
        addDaysISO(lastService.eventAt, GESTATION_DAYS);
    }
  }

  return {
    pregnant,
    servedAt: lastService?.eventAt ?? null,
    expectedCalvingAt,
    lastCalvingAt: lastCalving?.eventAt ?? null,
    lastAbortionAt: lastAbortion?.eventAt ?? null,
  };
}

export function deriveAlerts(input: {
  status: string;
  pregnancy: PregnancyInsight;
  withdrawalUntil: string | null;
  today: string;
}): AnimalAlert[] {
  const { status, pregnancy, withdrawalUntil, today } = input;
  if (status !== "ACTIVE" && status !== "DRY") return [];

  const alerts: AnimalAlert[] = [];

  if (pregnancy.pregnant && pregnancy.expectedCalvingAt) {
    const daysToCalving = daysBetween(today, pregnancy.expectedCalvingAt);
    if (
      status === "ACTIVE" &&
      daysToCalving > 0 &&
      daysToCalving <= DRY_OFF_DAYS_BEFORE_CALVING
    ) {
      alerts.push({
        code: "DRY_OFF",
        daysDelta: daysToCalving,
        date: pregnancy.expectedCalvingAt,
      });
    }
    if (daysToCalving >= 0 && daysToCalving <= CALVING_SOON_DAYS) {
      alerts.push({
        code: "CALVING_SOON",
        daysDelta: daysToCalving,
        date: pregnancy.expectedCalvingAt,
      });
    }
    if (daysToCalving >= -CALVING_OVERDUE_DAYS && daysToCalving < 0) {
      alerts.push({
        code: "CALVING_OVERDUE",
        daysDelta: daysToCalving,
        date: pregnancy.expectedCalvingAt,
      });
    }
  }

  if (pregnancy.pregnant && pregnancy.servedAt) {
    const daysSinceService = daysBetween(pregnancy.servedAt, today);
    if (daysSinceService >= PREG_CHECK_MIN_DAYS && daysSinceService <= PREG_CHECK_MAX_DAYS) {
      alerts.push({
        code: "PREGNANCY_CHECK",
        daysDelta: daysSinceService,
        date: pregnancy.servedAt,
      });
    }
  }

  if (withdrawalUntil) {
    const days = daysBetween(today, withdrawalUntil);
    if (days >= 0) {
      alerts.push({
        code: "MILK_WITHDRAWAL",
        daysDelta: days,
        date: withdrawalUntil,
      });
    }
  }

  return alerts;
}

export function deriveLactation(input: {
  status: string;
  calvings: { eventAt: string }[];
  today: string;
}): LactationInsight {
  const calvings = [...input.calvings].sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  const last = calvings[calvings.length - 1] ?? null;
  const lastCalvingAt = last?.eventAt ?? null;
  const daysInMilk =
    input.status === "ACTIVE" && lastCalvingAt
      ? daysBetween(lastCalvingAt, input.today)
      : null;
  return {
    lactationNumber: calvings.length,
    lastCalvingAt,
    daysInMilk,
  };
}
