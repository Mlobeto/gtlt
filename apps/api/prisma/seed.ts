import { PrismaClient, PartReplacementPattern } from "@prisma/client";

const prisma = new PrismaClient();

type PartTypeSeed = {
  code: string;
  name: string;
  pattern: PartReplacementPattern;
  defaultUsageThreshold: number | null;
  appliesPerBajada: boolean;
  description: string;
};

/**
 * Catálogo global Fase 1 — alineado a docs/arquitectura.md y al prompt de PartType.
 * Idempotente: upsert por `code`.
 */
const PART_TYPES: PartTypeSeed[] = [
  // Grupo de ordeñe por bajada — USAGE_BASED
  {
    code: "LINER",
    name: "Pezoneras",
    pattern: "USAGE_BASED",
    defaultUsageThreshold: 2000,
    appliesPerBajada: true,
    description:
      "Pezoneras del conjunto de ordeñe. Uso acumulado; umbral default 2000 ordeñes (editable por tenant).",
  },
  {
    code: "PULSE_SHORT_TUBE",
    name: "Tubos cortos de pulsado",
    pattern: "USAGE_BASED",
    defaultUsageThreshold: 2000,
    appliesPerBajada: true,
    description:
      "Tubos cortos de pulsado del conjunto de ordeñe. Uso acumulado; umbral default 2000 ordeñes.",
  },
  // Grupo de ordeñe por bajada — REACTIVE
  {
    code: "CLAW",
    name: "Centralizador",
    pattern: "REACTIVE",
    defaultUsageThreshold: null,
    appliesPerBajada: true,
    description:
      "Centralizador (y su base, frecuentemente acrílica). Revisión en cada service; sin alerta automática por uso.",
  },
  {
    code: "SHELL",
    name: "Copas",
    pattern: "REACTIVE",
    defaultUsageThreshold: null,
    appliesPerBajada: true,
    description: "Copas del conjunto de ordeñe. Revisión en cada service.",
  },
  // Nivel tambo — REACTIVE
  {
    code: "VACUUM_REGULATOR",
    name: "Regulador de vacío",
    pattern: "REACTIVE",
    defaultUsageThreshold: null,
    appliesPerBajada: false,
    description: "Regulador de vacío a nivel tambo. Revisión en service.",
  },
  {
    code: "VACUUM_TRAP",
    name: "Trampa de vacío",
    pattern: "REACTIVE",
    defaultUsageThreshold: null,
    appliesPerBajada: false,
    description: "Trampa de vacío a nivel tambo. Revisión en service.",
  },
  {
    code: "MILK_RECEIVER",
    name: "Recibidor de leche",
    pattern: "REACTIVE",
    defaultUsageThreshold: null,
    appliesPerBajada: false,
    description: "Recibidor de leche a nivel tambo. Revisión en service.",
  },
  {
    code: "VACUUM_PIPING",
    name: "Caños de vacío",
    pattern: "REACTIVE",
    defaultUsageThreshold: null,
    appliesPerBajada: false,
    description: "Cañería de vacío a nivel tambo. Revisión en service.",
  },
  {
    code: "MILK_PIPING",
    name: "Caños de leche",
    pattern: "REACTIVE",
    defaultUsageThreshold: null,
    appliesPerBajada: false,
    description: "Cañería de leche a nivel tambo. Revisión en service.",
  },
  {
    code: "DISCHARGE_SYSTEM",
    name: "Sistema de descarga",
    pattern: "REACTIVE",
    defaultUsageThreshold: null,
    appliesPerBajada: false,
    description:
      "Sistema de descarga (eléctrico o neumático) a nivel tambo. Revisión en service.",
  },
  // Equipo de frío — BRANDED
  {
    code: "COLD_TANK",
    name: "Equipo de frío",
    pattern: "BRANDED",
    defaultUsageThreshold: null,
    appliesPerBajada: false,
    description:
      "Tanque / equipo de frío. Campos propios en ColdEquipmentDetail (marca, modelo, capacidad, controlador EKC).",
  },
];

async function main() {
  for (const part of PART_TYPES) {
    await prisma.partType.upsert({
      where: { code: part.code },
      create: part,
      update: {
        name: part.name,
        pattern: part.pattern,
        defaultUsageThreshold: part.defaultUsageThreshold,
        appliesPerBajada: part.appliesPerBajada,
        description: part.description,
      },
    });
  }

  const count = await prisma.partType.count();
  console.log(`PartType seed OK: ${count} tipos en catálogo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
