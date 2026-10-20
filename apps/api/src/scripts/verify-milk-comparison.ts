import {
  compareDelivery,
  type ComparisonDelivery,
  type ComparisonSession,
} from "../lib/milk-comparison.js";

function session(
  date: string,
  shift: "MORNING" | "AFTERNOON",
  liters: number,
  status: "ACTIVE" | "VOIDED" = "ACTIVE",
): ComparisonSession {
  return { sessionDate: date, shift, totalLiters: liters, status };
}

function delivery(
  date: string | null,
  shift: "MORNING" | "AFTERNOON" | null,
  factory: number,
  guachera: number | null = null,
): ComparisonDelivery {
  return {
    pickupDate: date,
    pickupShift: shift,
    truckDeclaredLiters: factory,
    guacheraLiters: guachera,
  };
}

const previous = delivery("2026-10-10", "AFTERNOON", 0);
const current = delivery("2026-10-12", "MORNING", 3030);
const fullSessions: ComparisonSession[] = [
  session("2026-10-11", "MORNING", 1000),
  session("2026-10-11", "AFTERNOON", 1000),
  session("2026-10-12", "MORNING", 1000),
];

const cases: { name: string; run: () => ReturnType<typeof compareDelivery> }[] = [
  {
    name: "entrega normal dentro del umbral",
    run: () =>
      compareDelivery({
        delivery: current,
        previous,
        sessions: fullSessions,
        thresholdPct: 5,
      }),
  },
  {
    name: "una que lo supera",
    run: () =>
      compareDelivery({
        delivery: delivery("2026-10-12", "MORNING", 3300),
        previous,
        sessions: fullSessions,
        thresholdPct: 5,
      }),
  },
  {
    name: "con litros de guachera",
    run: () =>
      compareDelivery({
        delivery: delivery("2026-10-12", "MORNING", 2800, 200),
        previous,
        sessions: fullSessions,
        thresholdPct: 5,
      }),
  },
  {
    name: "con un turno faltante",
    run: () =>
      compareDelivery({
        delivery: current,
        previous,
        sessions: [
          session("2026-10-11", "MORNING", 1000),
          session("2026-10-12", "MORNING", 1000),
        ],
        thresholdPct: 5,
      }),
  },
  {
    name: "la primera entrega",
    run: () =>
      compareDelivery({
        delivery: current,
        previous: null,
        sessions: fullSessions,
        thresholdPct: 5,
      }),
  },
  {
    name: "una entrega sin momento",
    run: () =>
      compareDelivery({
        delivery: delivery(null, null, 3000),
        previous,
        sessions: fullSessions,
        thresholdPct: 5,
      }),
  },
  {
    name: "sin umbral",
    run: () =>
      compareDelivery({
        delivery: current,
        previous,
        sessions: fullSessions,
        thresholdPct: null,
      }),
  },
  {
    name: "sesiones anuladas ignoradas",
    run: () =>
      compareDelivery({
        delivery: current,
        previous,
        sessions: [...fullSessions, session("2026-10-11", "MORNING", 9000, "VOIDED")],
        thresholdPct: 5,
      }),
  },
  {
    name: "ordeñado en cero",
    run: () =>
      compareDelivery({
        delivery: current,
        previous,
        sessions: [
          session("2026-10-11", "MORNING", 0),
          session("2026-10-11", "AFTERNOON", 0),
          session("2026-10-12", "MORNING", 0),
        ],
        thresholdPct: 5,
      }),
  },
  {
    name: "dos entregas en el mismo día (mañana y tarde)",
    run: () =>
      compareDelivery({
        delivery: delivery("2026-10-12", "AFTERNOON", 1485),
        previous: delivery("2026-10-12", "MORNING", 3030),
        sessions: [session("2026-10-12", "AFTERNOON", 1500)],
        thresholdPct: 5,
      }),
  },
];

const expectedStatus = [
  "OK",
  "ALERT",
  "OK",
  "NOT_COMPARABLE",
  "NOT_COMPARABLE",
  "NOT_COMPARABLE",
  "NO_THRESHOLD",
  "OK",
  "NOT_COMPARABLE",
  "OK",
] as const;

let failed = 0;
cases.forEach((c, i) => {
  const result = c.run();
  const ok = result.status === expectedStatus[i];
  if (!ok) failed += 1;
  console.log(`\n# ${i + 1}. ${c.name}`);
  console.log(`status=${result.status} expected=${expectedStatus[i]} ${ok ? "OK" : "FAIL"}`);
  if (result.reason) console.log(`reason=${result.reason}`);
  console.log(JSON.stringify(result, null, 2));
});

if (failed > 0) {
  console.error(`\n${failed} caso(s) fallaron`);
  process.exit(1);
}
console.log("\n10 casos OK");
