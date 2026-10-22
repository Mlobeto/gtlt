import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { addDaysISO, argentinaToday } from "../lib/animal-insights.js";

const DEMO_NOTES = "DEMO CAL";
const SIRE_CODES = ["DEMO-001", "DEMO-9010"] as const;

function dbHost(raw: string): string | null {
  try {
    const normalized = raw.replace(/^postgres(?:ql)?:/i, "http:");
    return new URL(normalized).hostname;
  } catch {
    return null;
  }
}

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("Falta DATABASE_URL. Este script solo corre contra una base local.");
    process.exit(1);
  }
  const host = dbHost(raw);
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error(
      `Este script se niega a correr: DATABASE_URL apunta a "${host ?? "un host desconocido"}". Solo localhost o 127.0.0.1.`,
    );
    process.exit(1);
  }
}

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const pref = process.argv.find((a) => a.startsWith(`${name}=`));
  return pref ? pref.slice(name.length + 1) : undefined;
}

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function cleanTambo(tenantId: string, tamboId: string) {
  const animals = await prisma.animal.findMany({
    where: { tenantId, tamboId, notes: DEMO_NOTES },
    select: { id: true, earTag: true },
  });
  const ids = animals.map((a) => a.id);

  const controls = await prisma.controlLechero.findMany({
    where: { tenantId, tamboId, notes: DEMO_NOTES },
    select: { id: true },
  });
  const controlIds = controls.map((c) => c.id);
  if (controlIds.length) {
    await prisma.controlLecheroLine.deleteMany({ where: { controlLecheroId: { in: controlIds } } });
    await prisma.controlLechero.deleteMany({ where: { id: { in: controlIds } } });
  }

  if (ids.length) {
    await prisma.reproEvent.deleteMany({ where: { animalId: { in: ids }, notes: DEMO_NOTES } });
    await prisma.animal.updateMany({
      where: { id: { in: ids } },
      data: { motherId: null, sireId: null },
    });
    await prisma.animal.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.sire.deleteMany({
    where: { tenantId, registrationCode: { in: [...SIRE_CODES] } },
  });

  console.log(
    `Limpieza: ${animals.length} animal(es) (${animals.map((a) => a.earTag).join(", ") || "ninguno"}), ${controlIds.length} control(es), toros ${SIRE_CODES.join(" y ")}.`,
  );
}

async function upsertAnimal(input: {
  tenantId: string;
  tamboId: string;
  createdById: string;
  earTag: string;
  status?: "ACTIVE" | "DRY" | "SOLD" | "DEAD";
  birthDate?: string;
  breed?: string;
  motherId?: string | null;
  sireId?: string | null;
}) {
  const existing = await prisma.animal.findFirst({
    where: { tenantId: input.tenantId, tamboId: input.tamboId, earTag: input.earTag, notes: DEMO_NOTES },
  });
  const data = {
    status: input.status ?? "ACTIVE",
    birthDate: input.birthDate ? day(input.birthDate) : null,
    breed: input.breed ?? "Holando",
    notes: DEMO_NOTES,
    motherId: input.motherId ?? null,
    sireId: input.sireId ?? null,
    createdById: input.createdById,
  };
  if (existing) {
    return prisma.animal.update({
      where: { id: existing.id },
      data: { ...data, version: { increment: 1 } },
    });
  }
  return prisma.animal.create({
    data: {
      tenantId: input.tenantId,
      tamboId: input.tamboId,
      earTag: input.earTag,
      clientMutationId: `demo-cal-animal-${input.earTag}`,
      ...data,
    },
  });
}

async function upsertSire(input: {
  tenantId: string;
  name: string;
  registrationCode: string;
  isExternal: boolean;
  linkedAnimalId: string | null;
}) {
  const existing = await prisma.sire.findFirst({
    where: { tenantId: input.tenantId, registrationCode: input.registrationCode },
  });
  if (existing) {
    return prisma.sire.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        isExternal: input.isExternal,
        linkedAnimalId: input.linkedAnimalId,
      },
    });
  }
  return prisma.sire.create({ data: input });
}

async function upsertRepro(input: {
  tenantId: string;
  tamboId: string;
  animalId: string;
  createdById: string;
  type: "HEAT" | "SERVICE" | "EXPECTED_CALVING" | "CALVING";
  eventAt: string;
  expectedCalvingAt?: string;
  key: string;
}) {
  const clientMutationId = `demo-cal-repro-${input.key}`;
  const existing = await prisma.reproEvent.findFirst({
    where: { tenantId: input.tenantId, clientMutationId },
  });
  const data = {
    type: input.type,
    eventAt: new Date(`${input.eventAt}T12:00:00.000Z`),
    expectedCalvingAt: input.expectedCalvingAt ? day(input.expectedCalvingAt) : null,
    notes: DEMO_NOTES,
  };
  if (existing) {
    return prisma.reproEvent.update({ where: { id: existing.id }, data });
  }
  return prisma.reproEvent.create({
    data: {
      tenantId: input.tenantId,
      tamboId: input.tamboId,
      animalId: input.animalId,
      createdById: input.createdById,
      clientMutationId,
      ...data,
    },
  });
}

async function upsertControl(input: {
  tenantId: string;
  tamboId: string;
  createdById: string;
  key: string;
  performedAt: Date;
  lines: { animalId: string; bajadaNumber: number; liters: number }[];
}) {
  const clientMutationId = `demo-cal-ctrl-${input.key}`;
  const existing = await prisma.controlLechero.findFirst({
    where: { tenantId: input.tenantId, clientMutationId },
    include: { lines: true },
  });
  if (existing) {
    await prisma.controlLecheroLine.deleteMany({ where: { controlLecheroId: existing.id } });
    await prisma.controlLecheroLine.createMany({
      data: input.lines.map((l) => ({
        tenantId: input.tenantId,
        tamboId: input.tamboId,
        controlLecheroId: existing.id,
        animalId: l.animalId,
        bajadaNumber: l.bajadaNumber,
        liters: l.liters,
      })),
    });
    return prisma.controlLechero.update({
      where: { id: existing.id },
      data: { performedAt: input.performedAt, notes: DEMO_NOTES },
    });
  }
  return prisma.controlLechero.create({
    data: {
      tenantId: input.tenantId,
      tamboId: input.tamboId,
      createdById: input.createdById,
      performedAt: input.performedAt,
      source: "EXTERNAL_TECHNICIAN",
      technicianName: "Demo",
      notes: DEMO_NOTES,
      clientMutationId,
      lines: {
        create: input.lines.map((l) => ({
          tenantId: input.tenantId,
          tamboId: input.tamboId,
          animalId: l.animalId,
          bajadaNumber: l.bajadaNumber,
          liters: l.liters,
        })),
      },
    },
  });
}

async function main() {
  assertLocalDatabase();
  const cleanOnly = process.argv.includes("--clean");
  const tamboIdArg = argValue("--tamboId");

  const tambo = tamboIdArg
    ? await prisma.tambo.findFirst({ where: { id: tamboIdArg } })
    : await prisma.tambo.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tambo) {
    console.error("No hay tambo. Pasá --tamboId o cargá un tenant con tambo.");
    process.exit(1);
  }
  const tenantId = tambo.tenantId;
  const user = await prisma.user.findFirst({
    where: { memberships: { some: { tenantId } } },
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    console.error("No hay usuario en el tenant del tambo.");
    process.exit(1);
  }

  console.log(`Tambo ${tambo.name} (${tambo.id}) · tenant ${tenantId}`);

  if (cleanOnly) {
    await cleanTambo(tenantId, tambo.id);
    return;
  }

  const a9001 = await upsertAnimal({
    tenantId,
    tamboId: tambo.id,
    createdById: user.id,
    earTag: "9001",
    birthDate: "2016-03-12",
  });
  const a9006 = await upsertAnimal({
    tenantId,
    tamboId: tambo.id,
    createdById: user.id,
    earTag: "9006",
    status: "SOLD",
    birthDate: "2015-08-01",
  });
  const toroDemo = await upsertSire({
    tenantId,
    name: "Toro Demo",
    registrationCode: "DEMO-001",
    isExternal: true,
    linkedAnimalId: null,
  });
  const a9002 = await upsertAnimal({
    tenantId,
    tamboId: tambo.id,
    createdById: user.id,
    earTag: "9002",
    birthDate: "2018-04-20",
    motherId: a9001.id,
    sireId: toroDemo.id,
  });
  const a9010 = await upsertAnimal({
    tenantId,
    tamboId: tambo.id,
    createdById: user.id,
    earTag: "9010",
    birthDate: "2019-02-10",
    motherId: a9006.id,
  });
  const toroPropio = await upsertSire({
    tenantId,
    name: "Toro propio 9010",
    registrationCode: "DEMO-9010",
    isExternal: false,
    linkedAnimalId: a9010.id,
  });
  const a9003 = await upsertAnimal({
    tenantId,
    tamboId: tambo.id,
    createdById: user.id,
    earTag: "9003",
    birthDate: "2020-06-15",
    motherId: a9002.id,
    sireId: toroDemo.id,
  });
  const a9004 = await upsertAnimal({
    tenantId,
    tamboId: tambo.id,
    createdById: user.id,
    earTag: "9004",
    birthDate: "2026-06-01",
    motherId: a9003.id,
  });
  const a9005 = await upsertAnimal({
    tenantId,
    tamboId: tambo.id,
    createdById: user.id,
    earTag: "9005",
    birthDate: "2024-03-01",
    motherId: a9002.id,
    sireId: toroPropio.id,
  });

  const today = argentinaToday();
  await upsertRepro({
    tenantId,
    tamboId: tambo.id,
    animalId: a9003.id,
    createdById: user.id,
    type: "SERVICE",
    eventAt: addDaysISO(today, -680),
    key: "9003-svc-1",
  });
  await upsertRepro({
    tenantId,
    tamboId: tambo.id,
    animalId: a9003.id,
    createdById: user.id,
    type: "CALVING",
    eventAt: addDaysISO(today, -400),
    key: "9003-calv-1",
  });
  await upsertRepro({
    tenantId,
    tamboId: tambo.id,
    animalId: a9003.id,
    createdById: user.id,
    type: "CALVING",
    eventAt: addDaysISO(today, -100),
    key: "9003-calv-2",
  });
  const expected = addDaysISO(today, 45);
  await upsertRepro({
    tenantId,
    tamboId: tambo.id,
    animalId: a9003.id,
    createdById: user.id,
    type: "SERVICE",
    eventAt: addDaysISO(today, -45),
    expectedCalvingAt: expected,
    key: "9003-svc-2",
  });
  await upsertRepro({
    tenantId,
    tamboId: tambo.id,
    animalId: a9003.id,
    createdById: user.id,
    type: "EXPECTED_CALVING",
    eventAt: addDaysISO(today, -40),
    expectedCalvingAt: expected,
    key: "9003-exp",
  });

  const liters9003 = [22.5, 20.0, 19.0, 18.5];
  const offsets = [90, 60, 30, 10];
  for (let i = 0; i < 4; i += 1) {
    await upsertControl({
      tenantId,
      tamboId: tambo.id,
      createdById: user.id,
      key: String(i + 1),
      performedAt: new Date(`${addDaysISO(today, -offsets[i])}T14:00:00.000Z`),
      lines: [
        { animalId: a9003.id, bajadaNumber: 1, liters: liters9003[i] },
        { animalId: a9002.id, bajadaNumber: 1, liters: 16 + i },
        { animalId: a9005.id, bajadaNumber: 2, liters: 14 + i * 0.5 },
      ],
    });
  }

  console.log("Creado / actualizado (notes = DEMO CAL):");
  console.log(`  9001 abuela ${a9001.id}`);
  console.log(`  9002 madre ${a9002.id} (madre 9001, padre Toro Demo ${toroDemo.id})`);
  console.log(`  9003 vaca ${a9003.id} (madre 9002, padre Toro Demo) + repro + 4 controles`);
  console.log(`  9004 cría ${a9004.id} (madre 9003)`);
  console.log(`  9005 ${a9005.id} (madre 9002, padre propio 9010)`);
  console.log(`  9006 vendida ${a9006.id} (madre de 9010)`);
  console.log(`  9010 toro propio ${a9010.id} (Sire ${toroPropio.id})`);
  console.log(`  Toro Demo externo ${toroDemo.registrationCode}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
