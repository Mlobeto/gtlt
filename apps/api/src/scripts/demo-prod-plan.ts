import { createHash } from "node:crypto";

/** Espacio de nombres fijo para UUID v5 (no es un secreto). */
export const DEMO_NAMESPACE = "a1b2c3d4-e5f6-4789-8abc-def012345678";

export const DEMO_TENANT_NAME = "[DEMO] Tambos del Sur";
export const DEMO_OWNER_NAME = "Dueño Demo";
export const DEMO_PROVIDER_NAME = "[DEMO] Servicio de prueba";

export const TAMBO_DEFS = [
  {
    slug: "ceibos",
    name: "Los Ceibos",
    bajadaCount: 8,
    powerSupply: "THREEPHASE" as const,
    pumpCount: 1,
    tagFrom: 1001,
    tagTo: 1025,
    bullTag: "1900",
    milkMean: 520,
    milkSpread: 40,
    thresholdPct: 3 as number | null,
  },
  {
    slug: "aurora",
    name: "La Aurora",
    bajadaCount: 6,
    powerSupply: "MONOPHASE" as const,
    pumpCount: 1,
    tagFrom: 2001,
    tagTo: 2025,
    bullTag: "2900",
    milkMean: 330,
    milkSpread: 30,
    thresholdPct: null as number | null,
  },
] as const;

export type TamboSlug = (typeof TAMBO_DEFS)[number]["slug"];

export function ownBullSireCode(slug: string): string {
  return `DEMO-${slug.toUpperCase()}-BULL`;
}

export const EXTERNAL_SIRES = [
  { key: "A", name: "Toro Demo A", registrationCode: "DEMO-A" },
  { key: "B", name: "Toro Demo B", registrationCode: "DEMO-B" },
  { key: "C", name: "Toro Demo C", registrationCode: "DEMO-C" },
] as const;

export type AnimalSpec = {
  id: string;
  clientMutationId: string;
  earTag: string;
  status: "ACTIVE" | "DRY" | "SOLD";
  birthDate: string;
  breed: "Holando" | "Jersey";
  motherEarTag: string | null;
  sireCode: string | null;
  isBull: boolean;
};

export type ReproSpec = {
  id: string;
  clientMutationId: string;
  earTag: string;
  type: "SERVICE" | "EXPECTED_CALVING" | "CALVING";
  eventAt: string;
  expectedCalvingAt?: string;
};

export type HealthSpec = {
  id: string;
  clientMutationId: string;
  earTag: string;
  type: "MASTITIS" | "TREATMENT";
  eventAt: string;
  productName: string;
  milkWithdrawalUntil: string | null;
};

export type WeightSpec = {
  id: string;
  clientMutationId: string;
  earTag: string;
  weightKg: number;
  measuredAt: string;
};

export type ControlSpec = {
  id: string;
  clientMutationId: string;
  performedAt: string;
  lines: { earTag: string; bajadaNumber: number; liters: number }[];
};

export type MilkingSpec = {
  id: string;
  clientMutationId: string;
  sessionDate: string;
  shift: "MORNING" | "AFTERNOON";
  totalLiters: number;
};

export type DeliverySpec = {
  id: string;
  clientMutationId: string;
  periodStart: string;
  periodEnd: string;
  pickupDate: string;
  pickupShift: "MORNING" | "AFTERNOON";
  coldTankLiters: number;
  truckDeclaredLiters: number;
  guacheraLiters: number;
  largeDiff: boolean;
  coversMissingTurn: boolean;
};

export type TamboPlan = {
  slug: TamboSlug;
  name: string;
  bajadaCount: number;
  powerSupply: "MONOPHASE" | "THREEPHASE";
  pumpCount: number;
  thresholdPct: number | null;
  animals: AnimalSpec[];
  cows: AnimalSpec[];
  bull: AnimalSpec;
  repro: ReproSpec[];
  health: HealthSpec[];
  weights: WeightSpec[];
  controls: ControlSpec[];
  milkings: MilkingSpec[];
  skippedTurns: { date: string; shift: "MORNING" | "AFTERNOON" }[];
  deliveries: DeliverySpec[];
};

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex.replace(/-/g, ""), "hex");
}

/** UUID v5 RFC 4122, sin dependencias. */
export function uuidV5(name: string, namespace = DEMO_NAMESPACE): string {
  const hash = createHash("sha1").update(hexToBytes(namespace)).update(name).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function demoId(key: string): string {
  return uuidV5(`cal-demo:${key}`);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function atNoon(iso: string): string {
  return `${iso}T12:00:00.000Z`;
}

function atHour(iso: string, hour: number): string {
  return `${iso}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function statusForIndex(i: number): AnimalSpec["status"] {
  if (i < 20) return "ACTIVE";
  if (i < 24) return "DRY";
  return "SOLD";
}

function buildTambo(def: (typeof TAMBO_DEFS)[number], today: string, seed: number): TamboPlan {
  const rng = mulberry32(seed);
  const cows: AnimalSpec[] = [];
  for (let i = 0; i < 25; i += 1) {
    const earTag = String(def.tagFrom + i);
    const year = 2017 + (i % 6);
    const month = 1 + ((i * 3) % 12);
    const day = 1 + ((i * 5) % 27);
    const birthDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cows.push({
      id: demoId(`${def.slug}:animal:${earTag}`),
      clientMutationId: `demo:${def.slug}:animal:${earTag}`,
      earTag,
      status: statusForIndex(i),
      birthDate,
      breed: i % 7 === 0 ? "Jersey" : "Holando",
      motherEarTag: null,
      sireCode: null,
      isBull: false,
    });
  }

  const byAge = [...cows].sort((a, b) => a.birthDate.localeCompare(b.birthDate) || a.earTag.localeCompare(b.earTag));
  const oldest = byAge.slice(0, 8);
  const daughters = byAge.filter((c) => !oldest.includes(c)).slice(0, 10);
  daughters.forEach((cow, idx) => {
    const mother = oldest[idx % oldest.length]!;
    if (mother.birthDate < cow.birthDate && mother.earTag !== cow.earTag) {
      cow.motherEarTag = mother.earTag;
      const codes = ["DEMO-A", "DEMO-B", "DEMO-C", ownBullSireCode(def.slug)] as const;
      cow.sireCode = codes[idx % codes.length]!;
    }
  });

  const bull: AnimalSpec = {
    id: demoId(`${def.slug}:animal:${def.bullTag}`),
    clientMutationId: `demo:${def.slug}:animal:${def.bullTag}`,
    earTag: def.bullTag,
    status: "ACTIVE",
    birthDate: "2019-05-10",
    breed: "Holando",
    motherEarTag: oldest[0]?.earTag ?? null,
    sireCode: "DEMO-A",
    isBull: true,
  };

  const animals = [...cows, bull];
  const active = cows
    .filter((c) => c.status === "ACTIVE")
    .sort((a, b) => a.birthDate.localeCompare(b.birthDate) || a.earTag.localeCompare(b.earTag));

  const repro: ReproSpec[] = [];
  const pushRepro = (
    earTag: string,
    type: ReproSpec["type"],
    eventDay: string,
    key: string,
    expectedCalvingAt?: string,
  ) => {
    repro.push({
      id: demoId(`${def.slug}:repro:${earTag}:${key}`),
      clientMutationId: `demo:${def.slug}:repro:${earTag}:${key}`.slice(0, 100),
      earTag,
      type,
      eventAt: atNoon(eventDay),
      expectedCalvingAt,
    });
  };

  const soon = [10, 20, 28];
  soon.forEach((days, i) => {
    const cow = active[i]!;
    pushRepro(cow.earTag, "CALVING", addDays(today, -400), "calv1");
    pushRepro(cow.earTag, "CALVING", addDays(today, -120), "calv2");
    const expected = addDays(today, days);
    pushRepro(cow.earTag, "SERVICE", addDays(today, days - 280), "svc", expected);
    pushRepro(cow.earTag, "EXPECTED_CALVING", addDays(today, days - 20), "exp", expected);
  });

  const dryOff = [42, 50, 58];
  dryOff.forEach((days, i) => {
    const cow = active[3 + i]!;
    pushRepro(cow.earTag, "CALVING", addDays(today, -380), "calv1");
    pushRepro(cow.earTag, "CALVING", addDays(today, -150), "calv2");
    const expected = addDays(today, days);
    pushRepro(cow.earTag, "SERVICE", addDays(today, days - 280), "svc", expected);
    pushRepro(cow.earTag, "EXPECTED_CALVING", addDays(today, days - 15), "exp", expected);
  });

  {
    const cow = active[6]!;
    const expected = addDays(today, -6);
    pushRepro(cow.earTag, "CALVING", addDays(today, -360), "calv1");
    pushRepro(cow.earTag, "SERVICE", addDays(today, -286), "svc", expected);
    pushRepro(cow.earTag, "EXPECTED_CALVING", addDays(today, -20), "exp", expected);
  }

  [40, 52].forEach((since, i) => {
    const cow = active[7 + i]!;
    pushRepro(cow.earTag, "CALVING", addDays(today, -110), "calv1");
    const expected = addDays(today, 280 - since);
    pushRepro(cow.earTag, "SERVICE", addDays(today, -since), "svc", expected);
  });

  [9, 10, 11].forEach((idx, n) => {
    const cow = active[idx];
    if (!cow) return;
    pushRepro(cow.earTag, "CALVING", addDays(today, -500), "calv1");
    if (n > 0) pushRepro(cow.earTag, "CALVING", addDays(today, -200), "calv2");
    if (n > 1) pushRepro(cow.earTag, "CALVING", addDays(today, -80), "calv3");
    pushRepro(cow.earTag, "SERVICE", addDays(today, -90), "svc-old");
  });

  const healthCows = [active[10], active[11], active[12], active[13]].filter(Boolean) as AnimalSpec[];
  const health: HealthSpec[] = healthCows.map((cow, i) => {
    const live = i < 2;
    return {
      id: demoId(`${def.slug}:health:${i}`),
      clientMutationId: `demo:${def.slug}:health:${i}`,
      earTag: cow.earTag,
      type: i % 2 === 0 ? "MASTITIS" : "TREATMENT",
      eventAt: atNoon(addDays(today, -3 - i)),
      productName: i % 2 === 0 ? "Mastijet" : "Penicilina",
      milkWithdrawalUntil: live ? atHour(addDays(today, 4), 12) : atHour(addDays(today, -2), 12),
    };
  });

  const heifers = [...cows].sort((a, b) => b.birthDate.localeCompare(a.birthDate)).slice(0, 4);
  const weights: WeightSpec[] = [];
  heifers.forEach((cow, hi) => {
    const n = 2 + (hi % 2);
    for (let w = 0; w < n; w += 1) {
      weights.push({
        id: demoId(`${def.slug}:weight:${cow.earTag}:${w}`),
        clientMutationId: `demo:${def.slug}:weight:${cow.earTag}:${w}`,
        earTag: cow.earTag,
        weightKg: round1(280 + hi * 15 + w * 12 + rng() * 8),
        measuredAt: atNoon(addDays(today, -60 + w * 20)),
      });
    }
  });

  const controlDays = [90, 60, 30];
  const controlCows = active.slice(0, 15);
  const controls: ControlSpec[] = controlDays.map((ago, ci) => ({
    id: demoId(`${def.slug}:control:${ago}`),
    clientMutationId: `demo:${def.slug}:control:${ago}`,
    performedAt: atHour(addDays(today, -ago), 10),
    lines: controlCows.map((cow, li) => {
      const dim = 80 + (li % 200);
      const peak = 28 - Math.abs(dim - 60) / 12;
      return {
        earTag: cow.earTag,
        bajadaNumber: 1 + (li % def.bajadaCount),
        liters: round1(clamp(peak + rng() * 2, 8, 38)),
      };
    }),
  }));

  const skippedTurns = [
    { date: addDays(today, -7), shift: "AFTERNOON" as const },
    { date: addDays(today, -14), shift: "MORNING" as const },
    { date: addDays(today, -21), shift: "AFTERNOON" as const },
  ];
  const skipSet = new Set(skippedTurns.map((s) => `${s.date}:${s.shift}`));

  const milkings: MilkingSpec[] = [];
  for (let ago = 44; ago >= 0; ago -= 1) {
    const date = addDays(today, -ago);
    for (const shift of ["MORNING", "AFTERNOON"] as const) {
      if (skipSet.has(`${date}:${shift}`)) continue;
      const jitter = (rng() * 2 - 1) * def.milkSpread;
      milkings.push({
        id: demoId(`${def.slug}:milk:${date}:${shift}`),
        clientMutationId: `demo:${def.slug}:milk:${date}:${shift}`,
        sessionDate: date,
        shift,
        totalLiters: round1(clamp(def.milkMean + jitter, 80, 900)),
      });
    }
  }

  const deliveries: DeliverySpec[] = [];
  let prevPeriodEnd: string | null = null;
  let prevPickupDate: string | null = null;
  let alt = 0;
  for (let ago = 44; ago >= 1; ago -= 2) {
    const pickupDate = addDays(today, -ago);
    const pickupShift: "MORNING" | "AFTERNOON" = alt % 2 === 0 ? "MORNING" : "AFTERNOON";
    alt += 1;
    const periodStartDay = prevPickupDate ?? addDays(pickupDate, -2);
    const periodStart = prevPeriodEnd ?? atHour(periodStartDay, 8);
    const periodEnd = atHour(pickupDate, pickupShift === "MORNING" ? 14 : 20);
    const milked = milkings
      .filter((m) => m.sessionDate >= periodStartDay && m.sessionDate <= pickupDate)
      .reduce((n, m) => n + m.totalLiters, 0);
    const guacheraLiters = round1(8 + rng() * 6);
    const tank = round1(Math.max(1, milked - guacheraLiters));
    const coversMissingTurn = skippedTurns.some((s) => s.date >= periodStartDay && s.date <= pickupDate);
    const largeDiff = ago === 12 || ago === 24;
    const factor = largeDiff ? (ago === 12 ? 1.08 : 0.92) : 1 + (rng() * 0.04 - 0.02);
    deliveries.push({
      id: demoId(`${def.slug}:delivery:${pickupDate}:${pickupShift}`),
      clientMutationId: `demo:${def.slug}:del:${pickupDate}:${pickupShift}`,
      periodStart,
      periodEnd,
      pickupDate,
      pickupShift,
      coldTankLiters: tank,
      truckDeclaredLiters: round1(tank * factor),
      guacheraLiters,
      largeDiff,
      coversMissingTurn,
    });
    prevPickupDate = pickupDate;
    prevPeriodEnd = periodEnd;
  }

  return {
    slug: def.slug,
    name: def.name,
    bajadaCount: def.bajadaCount,
    powerSupply: def.powerSupply,
    pumpCount: def.pumpCount,
    thresholdPct: def.thresholdPct,
    animals,
    cows,
    bull,
    repro,
    health,
    weights,
    controls,
    milkings,
    skippedTurns,
    deliveries,
  };
}

export function buildDemoPlan(today: string) {
  const tambos = TAMBO_DEFS.map((def, i) => buildTambo(def, today, 20261022 + i * 97));
  const writeCount =
    3 + // sires externos (si no existen)
    tambos.reduce(
      (n, t) =>
        n +
        t.animals.length +
        t.repro.length +
        t.health.length +
        t.weights.length +
        t.controls.length +
        t.milkings.length +
        t.deliveries.length +
        1 + // toro propio
        1, // umbral (ceibos) o skip
      0,
    );
  return {
    today,
    tenantName: DEMO_TENANT_NAME,
    ownerName: DEMO_OWNER_NAME,
    providerName: DEMO_PROVIDER_NAME,
    tambos,
    writeCount,
    totals: {
      tambos: tambos.length,
      animals: tambos.reduce((n, t) => n + t.animals.length, 0),
      cows: tambos.reduce((n, t) => n + t.cows.length, 0),
      repro: tambos.reduce((n, t) => n + t.repro.length, 0),
      health: tambos.reduce((n, t) => n + t.health.length, 0),
      weights: tambos.reduce((n, t) => n + t.weights.length, 0),
      controls: tambos.reduce((n, t) => n + t.controls.length, 0),
      milkings: tambos.reduce((n, t) => n + t.milkings.length, 0),
      skippedTurns: tambos.reduce((n, t) => n + t.skippedTurns.length, 0),
      deliveries: tambos.reduce((n, t) => n + t.deliveries.length, 0),
      largeDiffDeliveries: tambos.reduce((n, t) => n + t.deliveries.filter((d) => d.largeDiff).length, 0),
    },
  };
}

export type DemoPlan = ReturnType<typeof buildDemoPlan>;

export function argentinaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
