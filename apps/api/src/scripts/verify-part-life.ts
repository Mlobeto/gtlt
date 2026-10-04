import { estimatePartLife, MILKINGS_PER_DAY } from "../lib/part-life.js";

const now = new Date("2026-10-04T12:00:00.000Z");

function daysAgo(days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}

function monthsAgo(months: number) {
  return daysAgo(Math.round(months * 30.44));
}

const cases = [
  {
    name: "tubos cortos hace 30 días, 8 bajadas, 80 vacas",
    input: {
      pattern: "USAGE_BASED" as const,
      usageThreshold: 2500,
      lifeMonths: null,
      installedAt: daysAgo(30),
      usageCounter: null,
      activeCows: 80,
      bajadaCount: 8,
      now,
    },
  },
  {
    name: "por ordeñes ya pasada del umbral",
    input: {
      pattern: "USAGE_BASED" as const,
      usageThreshold: 2500,
      lifeMonths: null,
      installedAt: daysAgo(200),
      usageCounter: 3000,
      activeCows: 80,
      bajadaCount: 8,
      now,
    },
  },
  {
    name: "tubo de leche hace 7 meses (vencido por tiempo)",
    input: {
      pattern: "USAGE_BASED" as const,
      usageThreshold: null,
      lifeMonths: 6,
      installedAt: monthsAgo(7),
      usageCounter: null,
      activeCows: 80,
      bajadaCount: 8,
      now,
    },
  },
  {
    name: "ambas reglas, manda el tiempo",
    input: {
      pattern: "USAGE_BASED" as const,
      usageThreshold: 2500,
      lifeMonths: 6,
      installedAt: monthsAgo(5),
      usageCounter: 200,
      activeCows: 20,
      bajadaCount: 8,
      now,
    },
  },
  {
    name: "REACTIVE",
    input: {
      pattern: "REACTIVE" as const,
      usageThreshold: 2500,
      lifeMonths: 6,
      installedAt: daysAgo(30),
      usageCounter: null,
      activeCows: 80,
      bajadaCount: 8,
      now,
    },
  },
  {
    name: "usageCounter contado",
    input: {
      pattern: "USAGE_BASED" as const,
      usageThreshold: 2500,
      lifeMonths: null,
      installedAt: daysAgo(10),
      usageCounter: 400,
      activeCows: 80,
      bajadaCount: 8,
      now,
    },
  },
  {
    name: "0 vacas",
    input: {
      pattern: "USAGE_BASED" as const,
      usageThreshold: 2500,
      lifeMonths: null,
      installedAt: daysAgo(30),
      usageCounter: null,
      activeCows: 0,
      bajadaCount: 8,
      now,
    },
  },
];

console.log(`MILKINGS_PER_DAY=${MILKINGS_PER_DAY}`);
for (const c of cases) {
  const result = estimatePartLife(c.input);
  console.log(`\n# ${c.name}`);
  console.log(JSON.stringify(result, null, 2));
}
