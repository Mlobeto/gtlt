import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveAlerts,
  deriveLactation,
  derivePregnancy,
  type PregnancyInsight,
} from "../lib/animal-insights.js";

type Vectors = {
  today: string;
  pregnancy: {
    name: string;
    events: { type: string; eventAt: string; expectedCalvingAt?: string | null }[];
    expected: PregnancyInsight;
  }[];
  alerts: {
    name: string;
    status: string;
    pregnancy: PregnancyInsight;
    withdrawalUntil: string | null;
    expectCodes: string[];
  }[];
  lactation: {
    name: string;
    status: string;
    calvings: { eventAt: string }[];
    expected: { lactationNumber: number; lastCalvingAt: string | null; daysInMilk: number | null };
  }[];
};

const here = dirname(fileURLToPath(import.meta.url));
const path = join(here, "../../../../docs/vectores-animal-insights.json");
const vectors = JSON.parse(readFileSync(path, "utf8")) as Vectors;

let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`OK  ${name}${detail ? ` · ${detail}` : ""}`);
  else {
    failed += 1;
    console.log(`FALLÓ  ${name}${detail ? ` · ${detail}` : ""}`);
  }
}

function samePregnancy(a: PregnancyInsight, b: PregnancyInsight): boolean {
  return (
    a.pregnant === b.pregnant &&
    a.servedAt === b.servedAt &&
    a.expectedCalvingAt === b.expectedCalvingAt &&
    a.lastCalvingAt === b.lastCalvingAt &&
    a.lastAbortionAt === b.lastAbortionAt
  );
}

for (const c of vectors.pregnancy) {
  const got = derivePregnancy(c.events);
  check(c.name, samePregnancy(got, c.expected), JSON.stringify(got));
}

for (const c of vectors.alerts) {
  const got = deriveAlerts({
    status: c.status,
    pregnancy: c.pregnancy,
    withdrawalUntil: c.withdrawalUntil,
    today: vectors.today,
  });
  const codes = got.map((a) => a.code);
  check(
    c.name,
    codes.length === c.expectCodes.length && codes.every((code, i) => code === c.expectCodes[i]),
    codes.join(",") || "(ninguna)",
  );
}

for (const c of vectors.lactation) {
  const got = deriveLactation({
    status: c.status,
    calvings: c.calvings,
    today: vectors.today,
  });
  check(
    c.name,
    got.lactationNumber === c.expected.lactationNumber &&
      got.lastCalvingAt === c.expected.lastCalvingAt &&
      got.daysInMilk === c.expected.daysInMilk,
    JSON.stringify(got),
  );
}

if (failed > 0) {
  console.error(`\n${failed} caso(s) fallaron`);
  process.exit(1);
}
console.log("\nTodos los casos OK");
