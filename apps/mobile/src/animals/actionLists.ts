import type { LocalAnimal, LocalHealthEvent, LocalReproEvent } from "../db";
import { derivePregnancy } from "./pregnancy";

const CALVING_SOON_DAYS = 30; // parto estimado dentro de los próximos 30 días
const CALVING_OVERDUE_DAYS = 15; // se sigue mostrando hasta 15 días de atraso
const DRY_OFF_DAYS_BEFORE_CALVING = 60;
const PREG_CHECK_MIN_DAYS = 30; // días desde el último servicio
const PREG_CHECK_MAX_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const LISTED_STATUSES = ["ACTIVE", "DRY"];

export type ActionItem = {
  animalId: string;
  earTag: string;
  detail: string;
  daysDelta: number;
  severity: "normal" | "late";
};

export type ActionLists = {
  calvingSoon: ActionItem[];
  dryOff: ActionItem[];
  withdrawals: ActionItem[];
  pregnancyCheck: ActionItem[];
};

/** Día calendario UTC (ms a las 00:00 UTC) de un `YYYY-MM-DD` o ISO completo. */
function utcDay(value: string | Date): number {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  }
  const date = typeof value === "string" ? new Date(value) : value;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function daysBetween(from: string | Date, to: string | Date): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function calvingDetail(days: number): string {
  if (days < 0) return `parto atrasado ${plural(-days, "día")}`;
  if (days === 0) return "parto estimado hoy";
  if (days === 1) return "parto mañana";
  return `parto en ${plural(days, "día")}`;
}

function withdrawalDetail(days: number): string {
  if (days <= 0) return "sale hoy";
  if (days === 1) return "sale mañana";
  return `sale en ${plural(days, "día")}`;
}

function byDays(direction: 1 | -1) {
  return (a: ActionItem, b: ActionItem) =>
    (a.daysDelta - b.daysDelta) * direction ||
    a.earTag.localeCompare(b.earTag, "es", { numeric: true }) ||
    a.animalId.localeCompare(b.animalId);
}

export function buildActionLists(input: {
  animals: LocalAnimal[];
  repros: LocalReproEvent[];
  withdrawals: LocalHealthEvent[];
  now: Date;
}): ActionLists {
  const { now } = input;
  const animals = new Map(
    input.animals
      .filter((a) => LISTED_STATUSES.includes(a.status))
      .map((a) => [a.id, a]),
  );

  const reprosByAnimal = new Map<string, LocalReproEvent[]>();
  for (const event of input.repros) {
    if (!animals.has(event.animal_id)) continue;
    const list = reprosByAnimal.get(event.animal_id) ?? [];
    list.push(event);
    reprosByAnimal.set(event.animal_id, list);
  }

  const calvingSoon: ActionItem[] = [];
  const dryOff: ActionItem[] = [];
  const pregnancyCheck: ActionItem[] = [];

  for (const [animalId, events] of reprosByAnimal) {
    const animal = animals.get(animalId)!;
    const pregnancy = derivePregnancy(events);
    if (!pregnancy.pregnant) continue;

    if (pregnancy.expectedCalvingAt) {
      const daysToCalving = daysBetween(now, pregnancy.expectedCalvingAt);
      if (daysToCalving >= -CALVING_OVERDUE_DAYS && daysToCalving <= CALVING_SOON_DAYS) {
        calvingSoon.push({
          animalId,
          earTag: animal.ear_tag,
          detail: calvingDetail(daysToCalving),
          daysDelta: daysToCalving,
          severity: daysToCalving < 0 ? "late" : "normal",
        });
      }
      if (
        animal.status === "ACTIVE" &&
        daysToCalving > 0 &&
        daysToCalving <= DRY_OFF_DAYS_BEFORE_CALVING
      ) {
        dryOff.push({
          animalId,
          earTag: animal.ear_tag,
          detail: calvingDetail(daysToCalving),
          daysDelta: daysToCalving,
          severity: "normal",
        });
      }
    }

    // Heurística: la app no registra el diagnóstico de preñez (tacto/ecografía),
    // así que no hay forma de saber si ya se hizo. La vaca aparece entre los 30 y
    // los 60 días desde el último servicio y desaparece sola al pasar los 60.
    if (pregnancy.servedAt) {
      const daysSinceService = daysBetween(pregnancy.servedAt, now);
      if (daysSinceService >= PREG_CHECK_MIN_DAYS && daysSinceService <= PREG_CHECK_MAX_DAYS) {
        pregnancyCheck.push({
          animalId,
          earTag: animal.ear_tag,
          detail: `servicio hace ${plural(daysSinceService, "día")}`,
          daysDelta: daysSinceService,
          severity: "normal",
        });
      }
    }
  }

  const latestWithdrawal = new Map<string, LocalHealthEvent>();
  for (const w of input.withdrawals) {
    if (!w.milk_withdrawal_until || !animals.has(w.animal_id)) continue;
    const current = latestWithdrawal.get(w.animal_id);
    if (!current || utcDay(w.milk_withdrawal_until) > utcDay(current.milk_withdrawal_until!)) {
      latestWithdrawal.set(w.animal_id, w);
    }
  }
  const withdrawals: ActionItem[] = [...latestWithdrawal.values()].map((w) => {
    const days = daysBetween(now, w.milk_withdrawal_until!);
    return {
      animalId: w.animal_id,
      earTag: animals.get(w.animal_id)!.ear_tag,
      detail: withdrawalDetail(days),
      daysDelta: days,
      severity: "normal",
    };
  });

  return {
    calvingSoon: calvingSoon.sort(byDays(1)),
    dryOff: dryOff.sort(byDays(1)),
    withdrawals: withdrawals.sort(byDays(1)),
    // Los servicios más viejos primero: son los que están por salir de la ventana.
    pregnancyCheck: pregnancyCheck.sort(byDays(-1)),
  };
}
