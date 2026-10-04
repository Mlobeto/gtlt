export type TamboLifecycleState = "ACTIVE" | "INSTALLING" | "ARCHIVED";

export function tamboLifecycleState(t: {
  active: boolean;
  activatedAt: Date | null;
}): TamboLifecycleState {
  if (!t.active) return "ARCHIVED";
  if (t.activatedAt == null) return "INSTALLING";
  return "ACTIVE";
}

export const billableTamboWhere = {
  active: true,
  activatedAt: { not: null },
} as const;

export const installingTamboWhere = {
  active: true,
  activatedAt: null,
} as const;
