import { PrismaClient, PartReplacementPattern, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Credenciales solo para desarrollo local — ver docs/arquitectura.md */
const DEMO_EMAIL = "admin@gtlt.local";
const DEMO_PASSWORD = "demo1234";
const DEMO_TECH_EMAIL = "tecnico@gtlt.local";
const DEMO_TAMBERO_EMAIL = "tambero@gtlt.local";
const DEMO_TAMBERO2_EMAIL = "tambero2@gtlt.local";
const DEMO_VET_EMAIL = "vet@gtlt.local";
const DEMO_DEV_EMAIL = "dev@gtlt.local";

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

async function seedPartTypes() {
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

async function seedServiceProviders() {
  let lobeto = await prisma.serviceProvider.findFirst({
    where: { name: "Lobeto Tambos" },
  });
  if (!lobeto) {
    lobeto = await prisma.serviceProvider.create({
      data: { name: "Lobeto Tambos", isDefault: true, active: true },
    });
  } else {
    await prisma.$transaction([
      prisma.serviceProvider.updateMany({
        where: { id: { not: lobeto.id } },
        data: { isDefault: false },
      }),
      prisma.serviceProvider.update({
        where: { id: lobeto.id },
        data: { isDefault: true, active: true },
      }),
    ]);
  }

  const omega = await prisma.serviceProvider.findFirst({
    where: { name: "Omega" },
  });
  if (!omega) {
    await prisma.serviceProvider.create({
      data: { name: "Omega", isDefault: false, active: true },
    });
  }

  return prisma.serviceProvider.findFirstOrThrow({
    where: { name: "Lobeto Tambos" },
  });
}

async function seedDemoTenant() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const defaultProvider = await seedServiceProviders();

  await prisma.plan.upsert({
    where: { code: "STANDARD" },
    create: {
      code: "STANDARD",
      name: "Estándar",
      // Precio fijo de referencia: USD 21/mes. priceArs se recalcula a diario
      // desde el dólar oficial (ver src/lib/plan-price-scheduler.ts).
      priceUsd: 21,
      priceArs: 0,
      billingIntervalMonths: 1,
    },
    update: { priceUsd: 21 },
  });

  await prisma.plan.upsert({
    where: { code: "LIFETIME" },
    create: {
      code: "LIFETIME",
      name: "Lifetime",
      priceArs: 0,
      billingIntervalMonths: null,
    },
    update: {},
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      name: "Admin Demo",
      passwordHash,
    },
    update: {
      name: "Admin Demo",
      passwordHash,
    },
  });

  let tenant = await prisma.tenant.findFirst({
    where: { name: "Tenant Demo GTLT" },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: "Tenant Demo GTLT" },
    });
  }

  let tambo = await prisma.tambo.findFirst({
    where: { tenantId: tenant.id, name: "Tambo Demo" },
  });

  if (!tambo) {
    tambo = await prisma.tambo.create({
      data: {
        tenantId: tenant.id,
        name: "Tambo Demo",
        bajadaCount: 8,
        defaultServiceProviderId: defaultProvider.id,
      },
    });
  } else if (!tambo.defaultServiceProviderId) {
    tambo = await prisma.tambo.update({
      where: { id: tambo.id },
      data: { defaultServiceProviderId: defaultProvider.id },
    });
  }

  const lifetimePlan = await prisma.plan.findUniqueOrThrow({ where: { code: "LIFETIME" } });
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      planId: lifetimePlan.id,
      status: "ACTIVE",
    },
    update: {},
  });

  const roles: Role[] = ["DUENIO", "ADMIN"];

  const membership = await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: user.id },
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      roles,
    },
    update: { roles },
  });

  const existingAnimal = await prisma.animal.findFirst({
    where: {
      tenantId: tenant.id,
      tamboId: tambo.id,
      earTag: "101",
      deletedAt: null,
    },
  });
  if (!existingAnimal) {
    await prisma.animal.create({
      data: {
        tenantId: tenant.id,
        tamboId: tambo.id,
        earTag: "101",
        status: "ACTIVE",
        notes: "Vaca demo para pruebas",
        createdById: user.id,
      },
    });
  }

  const techUser = await prisma.user.upsert({
    where: { email: DEMO_TECH_EMAIL },
    create: {
      email: DEMO_TECH_EMAIL,
      name: "Técnico Demo",
      passwordHash,
    },
    update: {
      name: "Técnico Demo",
      passwordHash,
    },
  });

  const techMembership = await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: techUser.id },
    },
    create: {
      tenantId: tenant.id,
      userId: techUser.id,
      roles: ["TECNICO"],
      status: "ACTIVE",
      companyName: "Service Demo",
    },
    update: {
      roles: ["TECNICO"],
      status: "ACTIVE",
      companyName: "Service Demo",
    },
    include: { tambos: true },
  });

  if (!techMembership.tambos.some((t) => t.tamboId === tambo.id)) {
    await prisma.membershipTambo.create({
      data: {
        tenantId: tenant.id,
        membershipId: techMembership.id,
        tamboId: tambo.id,
      },
    });
  }

  const tamberoUser = await prisma.user.upsert({
    where: { email: DEMO_TAMBERO_EMAIL },
    create: {
      email: DEMO_TAMBERO_EMAIL,
      name: "Tambero Demo",
      passwordHash,
    },
    update: {
      name: "Tambero Demo",
      passwordHash,
    },
  });

  const tamberoMembership = await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: tamberoUser.id },
    },
    create: {
      tenantId: tenant.id,
      userId: tamberoUser.id,
      roles: ["TAMBERO"],
      status: "ACTIVE",
    },
    update: {
      roles: ["TAMBERO"],
      status: "ACTIVE",
    },
    include: { tambos: true },
  });

  if (!tamberoMembership.tambos.some((t) => t.tamboId === tambo.id)) {
    await prisma.membershipTambo.create({
      data: {
        tenantId: tenant.id,
        membershipId: tamberoMembership.id,
        tamboId: tambo.id,
      },
    });
  }

  const vetUser = await prisma.user.upsert({
    where: { email: DEMO_VET_EMAIL },
    create: {
      email: DEMO_VET_EMAIL,
      name: "Veterinario Demo",
      passwordHash,
    },
    update: {
      name: "Veterinario Demo",
      passwordHash,
    },
  });

  const vetMembership = await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: vetUser.id },
    },
    create: {
      tenantId: tenant.id,
      userId: vetUser.id,
      roles: ["VETERINARIO"],
      status: "ACTIVE",
    },
    update: {
      roles: ["VETERINARIO"],
      status: "ACTIVE",
    },
    include: { tambos: true },
  });

  if (!vetMembership.tambos.some((t) => t.tamboId === tambo.id)) {
    await prisma.membershipTambo.create({
      data: {
        tenantId: tenant.id,
        membershipId: vetMembership.id,
        tamboId: tambo.id,
      },
    });
  }

  let tamboNorte = await prisma.tambo.findFirst({
    where: { tenantId: tenant.id, name: "Tambo Norte" },
  });

  if (!tamboNorte) {
    tamboNorte = await prisma.tambo.create({
      data: {
        tenantId: tenant.id,
        name: "Tambo Norte",
        bajadaCount: 8,
        defaultServiceProviderId: defaultProvider.id,
      },
    });
  } else if (!tamboNorte.defaultServiceProviderId) {
    tamboNorte = await prisma.tambo.update({
      where: { id: tamboNorte.id },
      data: { defaultServiceProviderId: defaultProvider.id },
    });
  }

  if (!techMembership.tambos.some((t) => t.tamboId === tamboNorte.id)) {
    await prisma.membershipTambo.create({
      data: {
        tenantId: tenant.id,
        membershipId: techMembership.id,
        tamboId: tamboNorte.id,
      },
    });
  }

  const tambero2User = await prisma.user.upsert({
    where: { email: DEMO_TAMBERO2_EMAIL },
    create: {
      email: DEMO_TAMBERO2_EMAIL,
      name: "Tambero Norte",
      passwordHash,
    },
    update: {
      name: "Tambero Norte",
      passwordHash,
    },
  });

  const tambero2Membership = await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: tambero2User.id },
    },
    create: {
      tenantId: tenant.id,
      userId: tambero2User.id,
      roles: ["TAMBERO"],
      status: "ACTIVE",
    },
    update: {
      roles: ["TAMBERO"],
      status: "ACTIVE",
    },
    include: { tambos: true },
  });

  if (!tambero2Membership.tambos.some((t) => t.tamboId === tamboNorte.id)) {
    await prisma.membershipTambo.create({
      data: {
        tenantId: tenant.id,
        membershipId: tambero2Membership.id,
        tamboId: tamboNorte.id,
      },
    });
  }

  const devUser = await prisma.user.upsert({
    where: { email: DEMO_DEV_EMAIL },
    create: {
      email: DEMO_DEV_EMAIL,
      name: "Desarrolladora Demo",
      passwordHash,
    },
    update: {
      name: "Desarrolladora Demo",
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: devUser.id },
    },
    create: {
      tenantId: tenant.id,
      userId: devUser.id,
      roles: ["DESARROLLADORA"],
      status: "ACTIVE",
    },
    update: {
      roles: ["DESARROLLADORA"],
      status: "ACTIVE",
    },
  });

  console.log("Demo seed OK:");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  tambero:  ${DEMO_TAMBERO_EMAIL} / ${DEMO_PASSWORD} (solo Tambo Demo)`);
  console.log(`  tambero2: ${DEMO_TAMBERO2_EMAIL} / ${DEMO_PASSWORD} (solo Tambo Norte)`);
  console.log(`  vet:      ${DEMO_VET_EMAIL} / ${DEMO_PASSWORD} (solo Tambo Demo)`);
  console.log(`  técnico:  ${DEMO_TECH_EMAIL} / ${DEMO_PASSWORD} (ambos tambos)`);
  console.log(`  dev:      ${DEMO_DEV_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  tenant:   ${tenant.id} (${tenant.name})`);
  console.log(`  tambo:    ${tambo.id} (${tambo.name})`);
  console.log(`  tambo2:   ${tamboNorte.id} (${tamboNorte.name})`);
  console.log(
    `  serviceRequiresOwnerApproval: ${tambo.serviceRequiresOwnerApproval}`,
  );
  console.log(`  membership roles: ${membership.roles.join(", ")}`);
  console.log(`  animal:   caravana 101`);
  console.log(`  plan:     LIFETIME / ACTIVE`);
}

async function main() {
  await seedPartTypes();
  await seedDemoTenant();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
