import type { PartInstance, PartType, TenantPartTypeConfig } from "@prisma/client";
import { prisma } from "./prisma.js";
import { estimatePartLife, type PartLifeResult } from "./part-life.js";

export type EffectiveThresholds = {
  usageThreshold: number | null;
  lifeMonths: number | null;
};

export function effectiveThresholds(
  partType: Pick<PartType, "defaultUsageThreshold" | "defaultLifeMonths">,
  config: Pick<TenantPartTypeConfig, "usageThreshold" | "lifeMonths"> | null | undefined,
): EffectiveThresholds {
  return {
    usageThreshold: config?.usageThreshold ?? partType.defaultUsageThreshold ?? null,
    lifeMonths: config?.lifeMonths ?? partType.defaultLifeMonths ?? null,
  };
}

export async function loadPartLifeContext(tenantId: string, tamboIds: string[]) {
  const unique = [...new Set(tamboIds.filter(Boolean))];
  const [tambos, configs, cowGroups] = await Promise.all([
    unique.length
      ? prisma.tambo.findMany({
          where: { tenantId, id: { in: unique } },
          select: { id: true, bajadaCount: true },
        })
      : Promise.resolve([]),
    prisma.tenantPartTypeConfig.findMany({ where: { tenantId } }),
    unique.length
      ? prisma.animal.groupBy({
          by: ["tamboId"],
          where: { tenantId, tamboId: { in: unique }, status: "ACTIVE" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const tamboById = new Map(tambos.map((t) => [t.id, t]));
  const cowsByTambo = new Map(cowGroups.map((g) => [g.tamboId, g._count._all]));
  const configByType = new Map(configs.map((c) => [c.partTypeId, c]));

  return { tamboById, cowsByTambo, configByType };
}

export function lifeForInstance(
  item: PartInstance & { partType: PartType },
  ctx: Awaited<ReturnType<typeof loadPartLifeContext>>,
  now = new Date(),
) {
  const tambo = ctx.tamboById.get(item.tamboId);
  const config = ctx.configByType.get(item.partTypeId);
  const thresholds = effectiveThresholds(item.partType, config);
  const usageCounter =
    item.usageCounter == null
      ? null
      : typeof item.usageCounter === "number"
        ? item.usageCounter
        : item.usageCounter.toNumber();

  const life: PartLifeResult = estimatePartLife({
    pattern: item.partType.pattern,
    usageThreshold: thresholds.usageThreshold,
    lifeMonths: thresholds.lifeMonths,
    installedAt: item.installedAt,
    usageCounter,
    activeCows: ctx.cowsByTambo.get(item.tamboId) ?? 0,
    bajadaCount: tambo?.bajadaCount ?? 1,
    now,
  });

  return {
    life,
    installedAtApprox: item.installedAtApprox,
    effectiveUsageThreshold: thresholds.usageThreshold,
    effectiveLifeMonths: thresholds.lifeMonths,
  };
}

export async function withPartLife<T extends PartInstance & { partType: PartType }>(
  tenantId: string,
  items: T[],
) {
  const ctx = await loadPartLifeContext(
    tenantId,
    items.map((i) => i.tamboId),
  );
  return items.map((item) => ({
    ...item,
    ...lifeForInstance(item, ctx),
  }));
}
