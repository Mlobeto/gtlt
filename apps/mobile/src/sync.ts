import * as Crypto from "expo-crypto";
import {
  correctMilkingSession,
  createAnimal,
  createControlLechero,
  createHealthEvent,
  createMilkDelivery,
  createMilkingSession,
  createReproEvent,
  fetchActiveWithdrawals,
  fetchAnimals,
  fetchControlLecheros,
  fetchMilkDeliveries,
  fetchMilkingSessions,
  fetchReproEvents,
  updateAnimal,
  createWeightEvent,
} from "./api";
import {
  countPendingOutbox,
  enqueueOutbox,
  findActiveMilkingSession,
  listPendingOutbox,
  markOutboxError,
  markOutboxSynced,
  replaceAnimals,
  replaceSyncedControlLecheros,
  replaceSyncedMilkDeliveries,
  replaceSyncedMilkingSessions,
  replaceSyncedReproEvents,
  replaceSyncedWithdrawals,
  markAnimalSynced,
  upsertLocalAnimal,
  upsertLocalControlLechero,
  upsertLocalHealthEvent,
  upsertLocalMilkDelivery,
  upsertLocalMilkingSession,
  upsertLocalReproEvent,
  upsertLocalWeightEvent,
  markWeightEventSynced,
} from "./db";

function dateOnly(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v : v.toISOString();
  return s.slice(0, 10);
}

function toNum(v: string | number): number {
  return typeof v === "number" ? v : Number(v);
}

function sessionDateOnly(isoOrDate: string): string {
  return isoOrDate.slice(0, 10);
}

export async function pullServerState(
  token: string,
  tamboId: string,
): Promise<void> {
  const [
    animalsRes,
    withdrawalsRes,
    milkingsRes,
    deliveriesRes,
    controlsRes,
    reproRes,
  ] = await Promise.all([
    fetchAnimals(token, tamboId),
    fetchActiveWithdrawals(token, tamboId),
    fetchMilkingSessions(token, tamboId),
    fetchMilkDeliveries(token, tamboId),
    fetchControlLecheros(token, tamboId),
    fetchReproEvents(token, tamboId),
  ]);

  await replaceAnimals(
    tamboId,
    animalsRes.items.map((a) => ({
      id: a.id,
      tambo_id: a.tamboId,
      ear_tag: a.earTag,
      status: a.status,
      birth_date: dateOnly(a.birthDate),
      entered_at: dateOnly(a.enteredAt),
      photo_url: a.photoUrl,
      notes: a.notes,
      breed: a.breed ?? null,
      mother_id: a.motherId ?? null,
      sire_id: a.sireId ?? null,
      version: a.version ?? 1,
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

  await replaceSyncedMilkingSessions(
    tamboId,
    milkingsRes.items.map((m) => ({
      id: m.id,
      tambo_id: m.tamboId,
      session_date: sessionDateOnly(m.sessionDate),
      shift: m.shift,
      total_liters: toNum(m.totalLiters),
      status: m.status,
      corrects_session_id: null,
    })),
  );

  await replaceSyncedMilkDeliveries(
    tamboId,
    deliveriesRes.items.map((d) => ({
      id: d.id,
      tambo_id: d.tamboId,
      period_start: d.periodStart,
      period_end: d.periodEnd,
      cold_tank_liters: toNum(d.coldTankLiters),
      truck_declared_liters: toNum(d.truckDeclaredLiters),
      cold_tank_temperature_c:
        d.coldTankTemperatureC == null ? null : toNum(d.coldTankTemperatureC),
      truck_temperature_c:
        d.truckTemperatureC == null ? null : toNum(d.truckTemperatureC),
      notes: null,
      status: d.status,
    })),
  );

  await replaceSyncedControlLecheros(
    tamboId,
    controlsRes.items.map((c) => ({
      id: c.id,
      tambo_id: c.tamboId,
      performed_at: c.performedAt,
      technician_name: c.technicianName,
      notes: null,
      lines_json: JSON.stringify(
        c.lines.map((l) => ({
          animalId: l.animalId,
          bajadaNumber: l.bajadaNumber,
          liters: toNum(l.liters),
          earTag: l.animal?.earTag,
        })),
      ),
      status: c.status,
    })),
  );

  await replaceSyncedReproEvents(
    tamboId,
    reproRes.items.map((e) => ({
      id: e.id,
      tambo_id: e.tamboId,
      animal_id: e.animalId,
      type: e.type,
      event_at: e.eventAt,
      expected_calving_at: dateOnly(e.expectedCalvingAt),
      notes: e.notes,
    })),
  );
}

export async function queueAnimalCreateOffline(input: {
  tamboId: string;
  earTag: string;
  status?: "ACTIVE" | "DRY";
  birthDate?: string | null;
  notes?: string | null;
  breed?: string | null;
  motherId?: string | null;
  sireId?: string | null;
  photoLocalUri?: string | null;
}): Promise<string> {
  const id = Crypto.randomUUID();
  const payload = {
    id,
    tamboId: input.tamboId,
    earTag: input.earTag.trim(),
    status: input.status ?? "ACTIVE",
    birthDate: input.birthDate ?? null,
    notes: input.notes ?? null,
    breed: input.breed ?? null,
    motherId: input.motherId ?? null,
    sireId: input.sireId ?? null,
    clientMutationId: id,
  };

  await upsertLocalAnimal({
    id,
    tambo_id: input.tamboId,
    ear_tag: payload.earTag,
    status: payload.status,
    birth_date: input.birthDate ?? null,
    entered_at: null,
    photo_url: null,
    photo_local_uri: input.photoLocalUri ?? null,
    notes: input.notes ?? null,
    breed: input.breed ?? null,
    mother_id: input.motherId ?? null,
    sire_id: input.sireId ?? null,
    version: 1,
    pending: 1,
  });
  await enqueueOutbox(id, "AnimalCreate", payload);
  return id;
}

export async function queueAnimalUpdateOffline(input: {
  id: string;
  tamboId: string;
  earTag: string;
  status: "ACTIVE" | "DRY" | "SOLD" | "DEAD";
  birthDate?: string | null;
  notes?: string | null;
  breed?: string | null;
  motherId?: string | null;
  sireId?: string | null;
  photoLocalUri?: string | null;
  photoUrl?: string | null;
  version: number;
}): Promise<string> {
  const mutationId = Crypto.randomUUID();
  const payload = {
    id: input.id,
    earTag: input.earTag.trim(),
    status: input.status,
    birthDate: input.birthDate ?? null,
    notes: input.notes ?? null,
    breed: input.breed ?? null,
    motherId: input.motherId ?? null,
    sireId: input.sireId ?? null,
    photoUrl: input.photoUrl ?? null,
    version: input.version,
    clientMutationId: mutationId,
  };

  await upsertLocalAnimal({
    id: input.id,
    tambo_id: input.tamboId,
    ear_tag: payload.earTag,
    status: input.status,
    birth_date: input.birthDate ?? null,
    entered_at: null,
    photo_url: input.photoUrl ?? null,
    photo_local_uri: input.photoLocalUri ?? null,
    notes: input.notes ?? null,
    breed: input.breed ?? null,
    mother_id: input.motherId ?? null,
    sire_id: input.sireId ?? null,
    version: input.version,
    pending: 1,
  });
  await enqueueOutbox(mutationId, "AnimalUpdate", payload);
  return mutationId;
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

export async function queueReproEventOffline(input: {
  tamboId: string;
  animalId: string;
  type: "HEAT" | "SERVICE" | "EXPECTED_CALVING" | "CALVING" | "ABORTION" | "OTHER";
  expectedCalvingAt?: string | null;
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
    expectedCalvingAt: input.expectedCalvingAt ?? null,
    notes: input.notes,
    clientMutationId: id,
  };

  await upsertLocalReproEvent({
    id,
    tambo_id: input.tamboId,
    animal_id: input.animalId,
    type: input.type,
    event_at: eventAt,
    expected_calving_at: input.expectedCalvingAt ?? null,
    notes: input.notes ?? null,
    pending: 1,
  });
  await enqueueOutbox(id, "ReproEvent", payload);
  return id;
}

export async function queueWeightEventOffline(input: {
  tamboId: string;
  animalId: string;
  weightKg: number;
  method?: "SCALE" | "TAPE" | "VISUAL_ESTIMATE";
  notes?: string;
}): Promise<string> {
  const id = Crypto.randomUUID();
  const measuredAt = new Date().toISOString();
  const method = input.method ?? "VISUAL_ESTIMATE";
  const payload = {
    id,
    tamboId: input.tamboId,
    animalId: input.animalId,
    weightKg: input.weightKg,
    method,
    measuredAt,
    notes: input.notes,
    clientMutationId: id,
  };

  await upsertLocalWeightEvent({
    id,
    tambo_id: input.tamboId,
    animal_id: input.animalId,
    weight_kg: input.weightKg,
    method,
    measured_at: measuredAt,
    notes: input.notes ?? null,
    pending: 1,
  });
  await enqueueOutbox(id, "WeightEvent", payload);
  return id;
}

export async function queueMilkingSessionOffline(input: {
  tamboId: string;
  sessionDate: string;
  shift: "MORNING" | "AFTERNOON";
  totalLiters: number;
}): Promise<{ id: string; duplicate: boolean }> {
  const existing = await findActiveMilkingSession(
    input.tamboId,
    input.sessionDate,
    input.shift,
  );
  if (existing) {
    return { id: existing.id, duplicate: true };
  }

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
    status: "ACTIVE",
    corrects_session_id: null,
  });
  await enqueueOutbox(id, "MilkingSession", payload);
  return { id, duplicate: false };
}

export async function queueMilkingCorrectionOffline(input: {
  correctsSessionId: string;
  tamboId: string;
  sessionDate: string;
  shift: string;
  totalLiters: number;
}): Promise<string> {
  const id = Crypto.randomUUID();
  const payload = {
    correctsSessionId: input.correctsSessionId,
    id,
    totalLiters: input.totalLiters,
    clientMutationId: id,
    notes: "Corrección desde el celular",
  };

  await upsertLocalMilkingSession({
    id: input.correctsSessionId,
    tambo_id: input.tamboId,
    session_date: input.sessionDate,
    shift: input.shift,
    total_liters: input.totalLiters,
    pending: 0,
    status: "VOIDED",
    corrects_session_id: null,
  });
  await upsertLocalMilkingSession({
    id,
    tambo_id: input.tamboId,
    session_date: input.sessionDate,
    shift: input.shift,
    total_liters: input.totalLiters,
    pending: 1,
    status: "ACTIVE",
    corrects_session_id: input.correctsSessionId,
  });
  await enqueueOutbox(id, "MilkingSessionCorrect", payload);
  return id;
}

export async function queueMilkDeliveryOffline(input: {
  tamboId: string;
  periodStart: string;
  periodEnd: string;
  coldTankLiters: number;
  truckDeclaredLiters: number;
  coldTankTemperatureC?: number | null;
  truckTemperatureC?: number | null;
  notes?: string;
}): Promise<string> {
  const id = Crypto.randomUUID();
  const payload = {
    id,
    tamboId: input.tamboId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    coldTankLiters: input.coldTankLiters,
    truckDeclaredLiters: input.truckDeclaredLiters,
    coldTankTemperatureC: input.coldTankTemperatureC ?? null,
    truckTemperatureC: input.truckTemperatureC ?? null,
    notes: input.notes,
    clientMutationId: id,
  };

  await upsertLocalMilkDelivery({
    id,
    tambo_id: input.tamboId,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    cold_tank_liters: input.coldTankLiters,
    truck_declared_liters: input.truckDeclaredLiters,
    cold_tank_temperature_c: input.coldTankTemperatureC ?? null,
    truck_temperature_c: input.truckTemperatureC ?? null,
    notes: input.notes ?? null,
    pending: 1,
    status: "ACTIVE",
  });
  await enqueueOutbox(id, "MilkDelivery", payload);
  return id;
}

export async function queueControlLecheroOffline(input: {
  tamboId: string;
  performedAt: string;
  technicianName?: string;
  notes?: string;
  lines: { animalId: string; bajadaNumber: number; liters: number; earTag?: string }[];
}): Promise<string> {
  const id = Crypto.randomUUID();
  const payload = {
    id,
    tamboId: input.tamboId,
    performedAt: input.performedAt,
    technicianName: input.technicianName,
    notes: input.notes,
    clientMutationId: id,
    lines: input.lines.map((l) => ({
      animalId: l.animalId,
      bajadaNumber: l.bajadaNumber,
      liters: l.liters,
    })),
  };

  await upsertLocalControlLechero({
    id,
    tambo_id: input.tamboId,
    performed_at: input.performedAt,
    technician_name: input.technicianName ?? null,
    notes: input.notes ?? null,
    lines_json: JSON.stringify(input.lines),
    pending: 1,
    status: "ACTIVE",
  });
  await enqueueOutbox(id, "ControlLechero", payload);
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
      } else if (row.entity === "MilkingSessionCorrect") {
        const payload = JSON.parse(row.payload) as {
          correctsSessionId: string;
          id: string;
          totalLiters: number;
          notes?: string;
          clientMutationId: string;
        };
        await correctMilkingSession(token, payload.correctsSessionId, {
          id: payload.id,
          totalLiters: payload.totalLiters,
          notes: payload.notes,
          clientMutationId: payload.clientMutationId,
        });
      } else if (row.entity === "ReproEvent") {
        const payload = JSON.parse(row.payload) as Parameters<
          typeof createReproEvent
        >[1];
        await createReproEvent(token, payload);
      } else if (row.entity === "MilkDelivery") {
        const payload = JSON.parse(row.payload) as Parameters<
          typeof createMilkDelivery
        >[1];
        await createMilkDelivery(token, payload);
      } else if (row.entity === "ControlLechero") {
        const payload = JSON.parse(row.payload) as Parameters<
          typeof createControlLechero
        >[1];
        await createControlLechero(token, payload);
      } else if (row.entity === "AnimalCreate") {
        const payload = JSON.parse(row.payload) as Parameters<
          typeof createAnimal
        >[1];
        await createAnimal(token, payload);
      } else if (row.entity === "AnimalUpdate") {
        const payload = JSON.parse(row.payload) as {
          id: string;
          earTag?: string;
          status?: "ACTIVE" | "DRY" | "SOLD" | "DEAD";
          birthDate?: string | null;
          notes?: string | null;
          breed?: string | null;
          motherId?: string | null;
          sireId?: string | null;
          photoUrl?: string | null;
          version?: number;
          clientMutationId?: string;
        };
        await updateAnimal(token, payload.id, {
          earTag: payload.earTag,
          status: payload.status,
          birthDate: payload.birthDate,
          notes: payload.notes,
          breed: payload.breed,
          motherId: payload.motherId,
          sireId: payload.sireId,
          photoUrl: payload.photoUrl,
          version: payload.version,
          clientMutationId: payload.clientMutationId,
        });
        await markOutboxSynced(row.mutation_id);
        await markAnimalSynced(payload.id);
        synced += 1;
        continue;
      } else if (row.entity === "WeightEvent") {
        const payload = JSON.parse(row.payload) as Parameters<
          typeof createWeightEvent
        >[1];
        await createWeightEvent(token, payload);
        await markOutboxSynced(row.mutation_id);
        await markWeightEventSynced(payload.id ?? row.mutation_id);
        synced += 1;
        continue;
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
