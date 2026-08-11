import type { LocalReproEvent } from "../db";

/** Gestación bovina típica — aproximación para UI (no diagnóstico). */
const GESTATION_DAYS = 280;

export type PregnancySummary = {
  /** Preñada a partir del último servicio sin parto/aborto posterior. */
  pregnant: boolean;
  servedAt: string | null;
  expectedCalvingAt: string | null;
  lastCalvingAt: string | null;
  lastAbortionAt: string | null;
  /** Texto listo para la ficha. */
  headline: string;
  detailLines: string[];
};

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateLabel(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("es-AR");
}

/**
 * Resume preñez / pariciones a partir de eventos repro (sin entidad aparte).
 * Inicio ≈ último SERVICE; fin ≈ CALVING o ABORTION posterior.
 */
export function derivePregnancy(events: LocalReproEvent[]): PregnancySummary {
  const asc = [...events].sort((a, b) => a.event_at.localeCompare(b.event_at));
  const desc = [...asc].reverse();

  const lastService = desc.find((e) => e.type === "SERVICE") ?? null;
  const lastCalving = desc.find((e) => e.type === "CALVING") ?? null;
  const lastAbortion = desc.find((e) => e.type === "ABORTION") ?? null;

  let pregnant = false;
  let expectedCalvingAt: string | null = null;

  if (lastService) {
    const afterService = asc.filter((e) => e.event_at >= lastService.event_at);
    const ended = afterService.find(
      (e) => e.type === "CALVING" || e.type === "ABORTION",
    );
    pregnant = !ended;

    if (pregnant) {
      const explicit = afterService
        .filter((e) => e.type === "EXPECTED_CALVING" || e.expected_calving_at)
        .reverse()[0];
      expectedCalvingAt =
        explicit?.expected_calving_at ??
        lastService.expected_calving_at ??
        addDaysISO(lastService.event_at, GESTATION_DAYS);
    }
  }

  const detailLines: string[] = [];
  let headline: string;

  if (pregnant && lastService) {
    headline = "Preñada";
    detailLines.push(`Servicio: ${dateLabel(lastService.event_at)}`);
    if (expectedCalvingAt) {
      detailLines.push(`Parto estimado: ${dateLabel(expectedCalvingAt)}`);
    }
  } else if (lastCalving && (!lastAbortion || lastCalving.event_at >= lastAbortion.event_at)) {
    headline = "Última parición registrada";
    detailLines.push(`Parición: ${dateLabel(lastCalving.event_at)}`);
    if (lastService && lastService.event_at < lastCalving.event_at) {
      detailLines.push(`Servicio previo: ${dateLabel(lastService.event_at)}`);
    }
  } else if (lastAbortion) {
    headline = "Último evento: aborto";
    detailLines.push(`Aborto: ${dateLabel(lastAbortion.event_at)}`);
  } else if (lastService) {
    headline = "Servicio sin cierre";
    detailLines.push(`Servicio: ${dateLabel(lastService.event_at)}`);
  } else {
    headline = "Sin datos de preñez";
    detailLines.push("Cargá un servicio o una parición en Repro.");
  }

  if (lastCalving && pregnant) {
    detailLines.push(`Última parición: ${dateLabel(lastCalving.event_at)}`);
  }

  return {
    pregnant,
    servedAt: lastService?.event_at ?? null,
    expectedCalvingAt,
    lastCalvingAt: lastCalving?.event_at ?? null,
    lastAbortionAt: lastAbortion?.event_at ?? null,
    headline,
    detailLines,
  };
}

export function reproHistoryDetail(event: LocalReproEvent): string | undefined {
  const bits: string[] = [];
  if (event.type === "CALVING") {
    bits.push("Parición");
  }
  if (event.expected_calving_at) {
    bits.push(`Parto est. ${dateLabel(event.expected_calving_at)}`);
  }
  if (event.notes) bits.push(event.notes);
  return bits.length ? bits.join(" · ") : undefined;
}
