export type MilkingShiftName = "MORNING" | "AFTERNOON";

export type ComparisonStatus = "OK" | "ALERT" | "NO_THRESHOLD" | "NOT_COMPARABLE";

export type ComparisonReason =
  | "FIRST_DELIVERY"
  | "NO_PICKUP_MOMENT"
  | "MISSING_TURNS"
  | "ZERO_MEASURED";

export type ComparisonTurn = { date: string; shift: MilkingShiftName };

export type ComparisonDelivery = {
  pickupDate: string | null;
  pickupShift: MilkingShiftName | null;
  truckDeclaredLiters: number;
  guacheraLiters: number | null;
};

export type ComparisonSession = {
  sessionDate: string;
  shift: MilkingShiftName;
  totalLiters: number;
  status: "ACTIVE" | "VOIDED" | string;
};

export type DeliveryComparison = {
  status: ComparisonStatus;
  reason?: ComparisonReason;
  measuredLiters: number;
  guacheraLiters: number;
  expectedLiters: number;
  factoryLiters: number;
  differenceLiters: number;
  differencePct: number;
  turnsExpected: ComparisonTurn[];
  turnsLoaded: ComparisonTurn[];
  missingTurns: ComparisonTurn[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDaysIso(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function dateOnly(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function compareMoments(
  a: ComparisonTurn,
  b: ComparisonTurn,
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.shift === b.shift) return 0;
  return a.shift === "MORNING" ? -1 : 1;
}

export function nextMoment(turn: ComparisonTurn): ComparisonTurn {
  if (turn.shift === "MORNING") return { date: turn.date, shift: "AFTERNOON" };
  return { date: addDaysIso(turn.date, 1), shift: "MORNING" };
}

/** Turnos posteriores al momento anterior, hasta este inclusive. */
export function turnsInPeriod(
  previous: ComparisonTurn,
  current: ComparisonTurn,
): ComparisonTurn[] {
  const turns: ComparisonTurn[] = [];
  let cursor = nextMoment(previous);
  while (compareMoments(cursor, current) <= 0) {
    turns.push(cursor);
    cursor = nextMoment(cursor);
    if (turns.length > 366 * 2) break;
  }
  return turns;
}

function emptyResult(
  extras: Partial<DeliveryComparison> & Pick<DeliveryComparison, "status">,
): DeliveryComparison {
  return {
    reason: extras.reason,
    measuredLiters: 0,
    guacheraLiters: 0,
    expectedLiters: 0,
    factoryLiters: 0,
    differenceLiters: 0,
    differencePct: 0,
    turnsExpected: [],
    turnsLoaded: [],
    missingTurns: [],
    ...extras,
  };
}

export function compareDelivery({
  delivery,
  previous,
  sessions,
  thresholdPct,
}: {
  delivery: ComparisonDelivery;
  previous: ComparisonDelivery | null;
  sessions: ComparisonSession[];
  thresholdPct: number | null;
}): DeliveryComparison {
  const factoryLiters = round1(delivery.truckDeclaredLiters);
  const guacheraLiters = round1(delivery.guacheraLiters ?? 0);

  if (!delivery.pickupDate || !delivery.pickupShift) {
    return emptyResult({
      status: "NOT_COMPARABLE",
      reason: "NO_PICKUP_MOMENT",
      factoryLiters,
      guacheraLiters,
    });
  }

  if (!previous) {
    return emptyResult({
      status: "NOT_COMPARABLE",
      reason: "FIRST_DELIVERY",
      factoryLiters,
      guacheraLiters,
    });
  }

  if (!previous.pickupDate || !previous.pickupShift) {
    return emptyResult({
      status: "NOT_COMPARABLE",
      reason: "NO_PICKUP_MOMENT",
      factoryLiters,
      guacheraLiters,
    });
  }

  const current: ComparisonTurn = {
    date: delivery.pickupDate,
    shift: delivery.pickupShift,
  };
  const prev: ComparisonTurn = {
    date: previous.pickupDate,
    shift: previous.pickupShift,
  };
  const turnsExpected = turnsInPeriod(prev, current);

  const active = sessions.filter((s) => s.status === "ACTIVE");
  const loadedKeys = new Set(
    active.map((s) => `${s.sessionDate}:${s.shift}`),
  );
  const turnsLoaded = turnsExpected.filter((t) => loadedKeys.has(`${t.date}:${t.shift}`));
  const missingTurns = turnsExpected.filter((t) => !loadedKeys.has(`${t.date}:${t.shift}`));

  const measuredLiters = round1(
    active
      .filter((s) => turnsExpected.some((t) => t.date === s.sessionDate && t.shift === s.shift))
      .reduce((sum, s) => sum + s.totalLiters, 0),
  );

  if (missingTurns.length > 0) {
    return emptyResult({
      status: "NOT_COMPARABLE",
      reason: "MISSING_TURNS",
      factoryLiters,
      guacheraLiters,
      measuredLiters,
      turnsExpected,
      turnsLoaded,
      missingTurns,
    });
  }

  const expectedLiters = round1(measuredLiters - guacheraLiters);
  if (measuredLiters === 0 || expectedLiters === 0) {
    return emptyResult({
      status: "NOT_COMPARABLE",
      reason: "ZERO_MEASURED",
      factoryLiters,
      guacheraLiters,
      measuredLiters,
      expectedLiters,
      turnsExpected,
      turnsLoaded,
      missingTurns,
    });
  }

  const differenceLiters = round1(factoryLiters - expectedLiters);
  const differencePct = round1((differenceLiters / expectedLiters) * 100);

  if (thresholdPct == null) {
    return {
      status: "NO_THRESHOLD",
      measuredLiters,
      guacheraLiters,
      expectedLiters,
      factoryLiters,
      differenceLiters,
      differencePct,
      turnsExpected,
      turnsLoaded,
      missingTurns,
    };
  }

  return {
    status: Math.abs(differencePct) > thresholdPct ? "ALERT" : "OK",
    measuredLiters,
    guacheraLiters,
    expectedLiters,
    factoryLiters,
    differenceLiters,
    differencePct,
    turnsExpected,
    turnsLoaded,
    missingTurns,
  };
}
