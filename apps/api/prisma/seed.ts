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

const SEED_MODE = process.env.SEED_MODE === "prod" ? "prod" : "dev";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? DEMO_EMAIL;
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? DEMO_PASSWORD;
const DEV_EMAIL = process.env.SEED_DEV_EMAIL ?? DEMO_DEV_EMAIL;
const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? DEMO_PASSWORD;
const TECH_EMAIL = process.env.SEED_TECH_EMAIL ?? DEMO_TECH_EMAIL;
const TECH_PASSWORD = process.env.SEED_TECH_PASSWORD ?? DEMO_PASSWORD;
const TAMBERO_EMAIL = process.env.SEED_TAMBERO_EMAIL ?? DEMO_TAMBERO_EMAIL;
const TAMBERO_PASSWORD = process.env.SEED_TAMBERO_PASSWORD ?? DEMO_PASSWORD;
const TAMBERO2_EMAIL = process.env.SEED_TAMBERO2_EMAIL ?? DEMO_TAMBERO2_EMAIL;
const TAMBERO2_PASSWORD = process.env.SEED_TAMBERO2_PASSWORD ?? DEMO_PASSWORD;
const VET_EMAIL = process.env.SEED_VET_EMAIL ?? DEMO_VET_EMAIL;
const VET_PASSWORD = process.env.SEED_VET_PASSWORD ?? DEMO_PASSWORD;

const TENANT_NAME = process.env.SEED_TENANT_NAME ?? "Mi tambo";
const TAMBO_NAME = process.env.SEED_TAMBO_NAME ?? "Mi tambo";

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

async function seedPlans() {
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
}

async function seedDevTenant(defaultProvider: { id: string }) {
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const techPasswordHash = await bcrypt.hash(TECH_PASSWORD, 10);
  const tamberoPasswordHash = await bcrypt.hash(TAMBERO_PASSWORD, 10);
  const tambero2PasswordHash = await bcrypt.hash(TAMBERO2_PASSWORD, 10);
  const vetPasswordHash = await bcrypt.hash(VET_PASSWORD, 10);
  const devPasswordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin Demo",
      passwordHash: adminPasswordHash,
    },
    update: {
      name: "Admin Demo",
      passwordHash: adminPasswordHash,
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
        activatedAt: new Date(),
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
    where: { email: TECH_EMAIL },
    create: {
      email: TECH_EMAIL,
      name: "Técnico Demo",
      passwordHash: techPasswordHash,
    },
    update: {
      name: "Técnico Demo",
      passwordHash: techPasswordHash,
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
    where: { email: TAMBERO_EMAIL },
    create: {
      email: TAMBERO_EMAIL,
      name: "Tambero Demo",
      passwordHash: tamberoPasswordHash,
    },
    update: {
      name: "Tambero Demo",
      passwordHash: tamberoPasswordHash,
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
    where: { email: VET_EMAIL },
    create: {
      email: VET_EMAIL,
      name: "Veterinario Demo",
      passwordHash: vetPasswordHash,
    },
    update: {
      name: "Veterinario Demo",
      passwordHash: vetPasswordHash,
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
        activatedAt: new Date(),
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
    where: { email: TAMBERO2_EMAIL },
    create: {
      email: TAMBERO2_EMAIL,
      name: "Tambero Norte",
      passwordHash: tambero2PasswordHash,
    },
    update: {
      name: "Tambero Norte",
      passwordHash: tambero2PasswordHash,
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
    where: { email: DEV_EMAIL },
    create: {
      email: DEV_EMAIL,
      name: "Desarrolladora Demo",
      passwordHash: devPasswordHash,
    },
    update: {
      name: "Desarrolladora Demo",
      passwordHash: devPasswordHash,
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

  console.log("SEED_MODE: dev");
  console.log("Cuentas creadas:");
  console.log(`  dueño/admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  tambero:     ${TAMBERO_EMAIL} / ${TAMBERO_PASSWORD} (solo Tambo Demo)`);
  console.log(`  tambero2:    ${TAMBERO2_EMAIL} / ${TAMBERO2_PASSWORD} (solo Tambo Norte)`);
  console.log(`  vet:         ${VET_EMAIL} / ${VET_PASSWORD} (solo Tambo Demo)`);
  console.log(`  técnico:     ${TECH_EMAIL} / ${TECH_PASSWORD} (ambos tambos)`);
  console.log(`  dev:         ${DEV_EMAIL} / ${DEV_PASSWORD}`);
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

async function seedProdTenant(defaultProvider: { id: string }) {
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const devPasswordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  const owner = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      name: "Dueño",
      passwordHash: adminPasswordHash,
    },
    update: {
      passwordHash: adminPasswordHash,
    },
  });

  let tenant = await prisma.tenant.findFirst({
    where: { name: TENANT_NAME },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: TENANT_NAME },
    });
  }

  let tambo = await prisma.tambo.findFirst({
    where: { tenantId: tenant.id, name: TAMBO_NAME },
  });

  if (!tambo) {
    tambo = await prisma.tambo.create({
      data: {
        tenantId: tenant.id,
        name: TAMBO_NAME,
        bajadaCount: 8,
        defaultServiceProviderId: defaultProvider.id,
        activatedAt: new Date(),
      },
    });
  } else if (!tambo.defaultServiceProviderId) {
    tambo = await prisma.tambo.update({
      where: { id: tambo.id },
      data: { defaultServiceProviderId: defaultProvider.id },
    });
  }

  const lifetimePlan = await prisma.plan.findUniqueOrThrow({
    where: { code: "LIFETIME" },
  });
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      planId: lifetimePlan.id,
      status: "ACTIVE",
    },
    update: {},
  });

  const ownerRoles: Role[] = ["DUENIO", "ADMIN"];
  await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: owner.id },
    },
    create: {
      tenantId: tenant.id,
      userId: owner.id,
      roles: ownerRoles,
    },
    update: { roles: ownerRoles },
  });

  const devUser = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    create: {
      email: DEV_EMAIL,
      name: "Desarrolladora",
      passwordHash: devPasswordHash,
    },
    update: {
      passwordHash: devPasswordHash,
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

  console.log("SEED_MODE: prod");
  console.log("Cuentas creadas:");
  console.log(`  dueño/admin:    ${ADMIN_EMAIL} (DUENIO, ADMIN)`);
  console.log(`  desarrolladora: ${DEV_EMAIL} (DESARROLLADORA)`);
  console.log(`  tenant: ${tenant.id} (${tenant.name})`);
  console.log(`  tambo:  ${tambo.id} (${tambo.name})`);
  console.log("  (contraseñas no se imprimen en modo prod)");
}

async function main() {
  await seedPartTypes();
  await seedPlans();
  const defaultProvider = await seedServiceProviders();

  if (SEED_MODE === "dev") {
    await seedDevTenant(defaultProvider);
  }
  if (SEED_MODE === "prod") {
    await seedProdTenant(defaultProvider);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
