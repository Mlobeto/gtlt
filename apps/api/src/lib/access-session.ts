import { prisma } from "./prisma.js";
import { HttpError } from "./http-error.js";
import type { AuthContext } from "../types/express.js";

export const SESSION_REVOKED_MESSAGE = "Tu acceso fue modificado. Volvé a ingresar.";
export const SESSION_REVOKED_CODE = "SESSION_REVOKED";

const CACHE_MAX = 5000;

type Snapshot = {
  membershipStatus: string | null;
  membershipValidAfterMs: number | null;
  userValidAfterMs: number | null;
};

type CacheEntry = { expiresAt: number; value: Snapshot };

const cache = new Map<string, CacheEntry>();

function cacheTtlMs(): number {
  const raw = process.env.ACCESS_CACHE_TTL_MS;
  if (raw === undefined || raw === "") return 30_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 30_000;
}

export function accessCheckEnabled(): boolean {
  return process.env.ACCESS_CHECK_ENABLED !== "false";
}

function keyOf(userId: string, tenantId: string) {
  return `${userId}:${tenantId}`;
}

function cacheGet(key: string): Snapshot | null {
  const ttl = cacheTtlMs();
  if (ttl === 0) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: Snapshot): void {
  const ttl = cacheTtlMs();
  if (ttl === 0) return;
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + ttl, value });
  while (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

export function invalidateAccess(userId: string, tenantId?: string): void {
  if (tenantId) {
    cache.delete(keyOf(userId, tenantId));
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}

export function clearAccessCacheForTests(): void {
  cache.clear();
}

async function loadSnapshot(userId: string, tenantId: string): Promise<Snapshot> {
  try {
    const membership = await prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        status: true,
        sessionsValidAfter: true,
        user: { select: { sessionsValidAfter: true } },
      },
    });
    if (!membership) {
      return { membershipStatus: null, membershipValidAfterMs: null, userValidAfterMs: null };
    }
    return {
      membershipStatus: membership.status,
      membershipValidAfterMs: membership.sessionsValidAfter?.getTime() ?? null,
      userValidAfterMs: membership.user.sessionsValidAfter?.getTime() ?? null,
    };
  } catch (err) {
    console.error("[access-session] no se pudo leer el acceso", err);
    throw new HttpError(503, "No se pudo comprobar el acceso. Probá de nuevo.");
  }
}

export async function assertSessionValid(auth: AuthContext): Promise<void> {
  const key = keyOf(auth.userId, auth.tenantId);
  let snap = cacheGet(key);
  if (!snap) {
    snap = await loadSnapshot(auth.userId, auth.tenantId);
    cacheSet(key, snap);
  }
  if (!snap.membershipStatus || snap.membershipStatus !== "ACTIVE") {
    throw new HttpError(401, SESSION_REVOKED_MESSAGE, SESSION_REVOKED_CODE);
  }
  const cutoffMs = Math.max(snap.membershipValidAfterMs ?? 0, snap.userValidAfterMs ?? 0);
  if (cutoffMs > 0) {
    const issuedAt = auth.issuedAt ?? 0;
    if (issuedAt < Math.floor(cutoffMs / 1000)) {
      throw new HttpError(401, SESSION_REVOKED_MESSAGE, SESSION_REVOKED_CODE);
    }
  }
}

export async function bumpUserSessionsValidAfter(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionsValidAfter: new Date() },
  });
  invalidateAccess(userId);
}

export async function bumpMembershipSessionsValidAfter(
  membershipId: string,
  userId: string,
  tenantId: string,
): Promise<void> {
  await prisma.membership.update({
    where: { id: membershipId },
    data: { sessionsValidAfter: new Date() },
  });
  invalidateAccess(userId, tenantId);
}
