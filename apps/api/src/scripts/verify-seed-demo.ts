import {
  EXTERNAL_SIRES,
  buildDemoPlan,
  demoId,
  ownBullSireCode,
  type TamboPlan,
} from "./demo-prod-plan.js";

let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`OK  ${name}${detail ? ` · ${detail}` : ""}`);
  else {
    failed += 1;
    console.log(`FALLÓ  ${name}${detail ? ` · ${detail}` : ""}`);
  }
}

function parentsExist(t: TamboPlan): boolean {
  const tags = new Set(t.animals.map((a) => a.earTag));
  const sireCodes = new Set<string>([
    ...EXTERNAL_SIRES.map((s) => s.registrationCode),
    ownBullSireCode(t.slug),
  ]);
  return t.animals.every((a) => {
    if (a.motherEarTag && !tags.has(a.motherEarTag)) return false;
    if (a.sireCode && !sireCodes.has(a.sireCode)) return false;
    return true;
  });
}

function noCycles(t: TamboPlan): boolean {
  const byTag = new Map(t.animals.map((a) => [a.earTag, a]));
  for (const a of t.animals) {
    const seen = new Set<string>();
    let cur: string | null = a.earTag;
    while (cur) {
      if (seen.has(cur)) return false;
      seen.add(cur);
      cur = byTag.get(cur)?.motherEarTag ?? null;
    }
  }
  return true;
}

function birthsBeforeCalvings(t: TamboPlan): boolean {
  const birth = new Map(t.animals.map((a) => [a.earTag, a.birthDate]));
  return t.repro
    .filter((e) => e.type === "CALVING")
    .every((e) => {
      const b = birth.get(e.earTag);
      if (!b) return false;
      const calvingDay = e.eventAt.slice(0, 10);
      return b < calvingDay;
    });
}

const today = "2026-10-22";
const a = buildDemoPlan(today);
const b = buildDemoPlan(today);

for (const t of a.tambos) {
  const cows = t.cows;
  const tags = cows.map((c) => c.earTag);
  check(
    `${t.name}: 25 vacas con caravanas únicas`,
    cows.length === 25 && new Set(tags).size === 25,
    `${cows.length} / ${new Set(tags).size}`,
  );
  check(`${t.name}: toro propio`, Boolean(t.bull) && t.animals.length === 26, t.bull.earTag);
  check(`${t.name}: madres y padres existen`, parentsExist(t));
  check(`${t.name}: genealogía sin ciclos`, noCycles(t));
  check(`${t.name}: nacimientos anteriores a partos`, birthsBeforeCalvings(t));
  check(
    `${t.name}: exactamente 3 turnos sin cargar`,
    t.skippedTurns.length === 3,
    String(t.skippedTurns.length),
  );
  const expectedTurns = 45 * 2 - 3;
  check(
    `${t.name}: ordeñes = 45 días × 2 − 3`,
    t.milkings.length === expectedTurns,
    String(t.milkings.length),
  );
  check(
    `${t.name}: 2 entregas con diferencia grande`,
    t.deliveries.filter((d) => d.largeDiff).length === 2,
    String(t.deliveries.filter((d) => d.largeDiff).length),
  );
  check(
    `${t.name}: una entrega cubre turno faltante`,
    t.deliveries.some((d) => d.coversMissingTurn),
  );
}

check(
  "ids iguales en dos corridas (mismo día)",
  JSON.stringify(a.tambos.map((t) => t.animals.map((x) => x.id))) ===
    JSON.stringify(b.tambos.map((t) => t.animals.map((x) => x.id))) &&
    a.tambos[0]!.milkings[0]!.id === b.tambos[0]!.milkings[0]!.id &&
    demoId("ceibos:animal:1001") === a.tambos[0]!.animals[0]!.id,
);

const ceibos = a.tambos.find((t) => t.slug === "ceibos")!;
const aurora = a.tambos.find((t) => t.slug === "aurora")!;
check("Los Ceibos umbral 3%", ceibos.thresholdPct === 3);
check("La Aurora sin umbral", aurora.thresholdPct == null);
check("caravana Ceibos 1001–1025", ceibos.cows[0]!.earTag === "1001" && ceibos.cows[24]!.earTag === "1025");
check("caravana Aurora 2001–2025", aurora.cows[0]!.earTag === "2001" && aurora.cows[24]!.earTag === "2025");

if (failed > 0) {
  console.log(`FALLÓ (${failed})`);
  process.exit(1);
}
console.log("OK");
