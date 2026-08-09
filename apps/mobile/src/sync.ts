import * as Crypto from "expo-crypto";
import {
  createHealthEvent,
  createMilkingSession,
  fetchActiveWithdrawals,
  fetchAnimals,
} from "./api";
import {
  countPendingOutbox,
  enqueueOutbox,
  listPendingOutbox,
  markOutboxError,
  markOutboxSynced,
  replaceAnimals,
  replaceSyncedWithdrawals,
  upsertLocalHealthEvent,
  upsertLocalMilkingSession,
} from "./db";

export async function pullServerState(
  token: string,
  tamboId: string,
): Promise<void> {
  const [animalsRes, withdrawalsRes] = await Promise.all([
    fetchAnimals(token, tamboId),
    fetchActiveWithdrawals(token, tamboId),
  ]);

  await replaceAnimals(
    tamboId,
    animalsRes.items.map((a) => ({
      id: a.id,
      tambo_id: a.tamboId,
      ear_tag: a.earTag,
      status: a.status,
    })),
  );

  await replaceSyncedWithdrawals(
    tamboId,
    withdrawalsRes.items.map((e) => ({
      id: e.id,
      tambo_id: e.tamboId,
      animal_id: e.animalId,
      type: e.type,
      event_at: e.eventAt,
      product_name: e.productName,
      milk_withdrawal_until: e.milkWithdrawalUntil,
      notes: e.notes,
    })),
  );
}

export async function queueHealthEventOffline(input: {
  tamboId: string;
  animalId: string;
  type: "MASTITIS" | "TREATMENT" | "OTHER";
  productName?: string;
  milkWithdrawalUntil?: string | null;
  notes?: string;
}): Promise<string> {
  const id = Crypto.randomUUID();
  const eventAt = new Date().toISOString();
  const payload = {
    id,
    tamboId: input.tamboId,
    animalId: input.animalId,
    type: input.type,
    eventAt,
    productName: input.productName,
    milkWithdrawalUntil: input.milkWithdrawalUntil ?? null,
    notes: input.notes,
    clientMutationId: id,
  };

  await upsertLocalHealthEvent({
    id,
    tambo_id: input.tamboId,
    animal_id: input.animalId,
    type: input.type,
    event_at: eventAt,
    product_name: input.productName ?? null,
    milk_withdrawal_until: input.milkWithdrawalUntil ?? null,
    notes: input.notes ?? null,
    pending: 1,
  });
  await enqueueOutbox(id, "HealthEvent", payload);
  return id;
}

export async function queueMilkingSessionOffline(input: {
  tamboId: string;
  sessionDate: string;
  shift: "MORNING" | "AFTERNOON";
  totalLiters: number;
}): Promise<string> {
  const id = Crypto.randomUUID();
  const payload = {
    id,
    tamboId: input.tamboId,
    sessionDate: input.sessionDate,
    shift: input.shift,
    totalLiters: input.totalLiters,
    clientMutationId: id,
  };

  await upsertLocalMilkingSession({
    id,
    tambo_id: input.tamboId,
    session_date: input.sessionDate,
    shift: input.shift,
    total_liters: input.totalLiters,
    pending: 1,
  });
  await enqueueOutbox(id, "MilkingSession", payload);
  return id;
}

export async function pushOutbox(token: string): Promise<{
  synced: number;
  failed: number;
  pendingLeft: number;
}> {
  const pending = await listPendingOutbox();
  let synced = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      if (row.entity === "HealthEvent") {
        const payload = JSON.parse(row.payload) as Parameters<
          typeof createHealthEvent
        >[1];
        await createHealthEvent(token, payload);
      } else if (row.entity === "MilkingSession") {
        const payload = JSON.parse(row.payload) as Parameters<
          typeof createMilkingSession
        >[1];
        await createMilkingSession(token, payload);
      } else {
        continue;
      }
      await markOutboxSynced(row.mutation_id);
      synced += 1;
    } catch (err) {
      failed += 1;
      await markOutboxError(
        row.mutation_id,
        err instanceof Error ? err.message : "sync error",
      );
    }
  }

  return {
    synced,
    failed,
    pendingLeft: await countPendingOutbox(),
  };
}

export async function fullSync(
  token: string,
  tamboId: string,
): Promise<{ synced: number; failed: number; pendingLeft: number }> {
  const pushResult = await pushOutbox(token);
  await pullServerState(token, tamboId);
  return pushResult;
}
