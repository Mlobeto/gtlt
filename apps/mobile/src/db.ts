import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("gtlt-offline-spike.db");
      await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS animals (
          id TEXT PRIMARY KEY NOT NULL,
          tambo_id TEXT NOT NULL,
          ear_tag TEXT NOT NULL,
          status TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS health_events_local (
          id TEXT PRIMARY KEY NOT NULL,
          tambo_id TEXT NOT NULL,
          animal_id TEXT NOT NULL,
          type TEXT NOT NULL,
          event_at TEXT NOT NULL,
          product_name TEXT,
          milk_withdrawal_until TEXT,
          notes TEXT,
          pending INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS milking_sessions_local (
          id TEXT PRIMARY KEY NOT NULL,
          tambo_id TEXT NOT NULL,
          session_date TEXT NOT NULL,
          shift TEXT NOT NULL,
          total_liters REAL NOT NULL,
          pending INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS outbox (
          mutation_id TEXT PRIMARY KEY NOT NULL,
          entity TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL,
          last_error TEXT
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function metaGet(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

export async function metaSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

export type LocalAnimal = {
  id: string;
  tambo_id: string;
  ear_tag: string;
  status: string;
};

export type LocalHealthEvent = {
  id: string;
  tambo_id: string;
  animal_id: string;
  type: string;
  event_at: string;
  product_name: string | null;
  milk_withdrawal_until: string | null;
  notes: string | null;
  pending: number;
  ear_tag?: string;
};

export type OutboxRow = {
  mutation_id: string;
  entity: string;
  payload: string;
  created_at: string;
  status: string;
  last_error: string | null;
};

export async function replaceAnimals(
  tamboId: string,
  animals: LocalAnimal[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM animals WHERE tambo_id = ?", [tamboId]);
    for (const a of animals) {
      await db.runAsync(
        "INSERT INTO animals (id, tambo_id, ear_tag, status) VALUES (?, ?, ?, ?)",
        [a.id, a.tambo_id, a.ear_tag, a.status],
      );
    }
  });
}

export async function listAnimals(tamboId: string): Promise<LocalAnimal[]> {
  const db = await getDb();
  return db.getAllAsync<LocalAnimal>(
    "SELECT * FROM animals WHERE tambo_id = ? ORDER BY ear_tag ASC",
    [tamboId],
  );
}

export async function upsertLocalHealthEvent(
  event: Omit<LocalHealthEvent, "ear_tag">,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO health_events_local
      (id, tambo_id, animal_id, type, event_at, product_name, milk_withdrawal_until, notes, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      event_at = excluded.event_at,
      product_name = excluded.product_name,
      milk_withdrawal_until = excluded.milk_withdrawal_until,
      notes = excluded.notes,
      pending = excluded.pending`,
    [
      event.id,
      event.tambo_id,
      event.animal_id,
      event.type,
      event.event_at,
      event.product_name,
      event.milk_withdrawal_until,
      event.notes,
      event.pending,
    ],
  );
}

export async function replaceSyncedWithdrawals(
  tamboId: string,
  events: Omit<LocalHealthEvent, "ear_tag" | "pending">[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM health_events_local WHERE tambo_id = ? AND pending = 0",
      [tamboId],
    );
    for (const e of events) {
      await db.runAsync(
        `INSERT INTO health_events_local
          (id, tambo_id, animal_id, type, event_at, product_name, milk_withdrawal_until, notes, pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          event_at = excluded.event_at,
          product_name = excluded.product_name,
          milk_withdrawal_until = excluded.milk_withdrawal_until,
          notes = excluded.notes,
          pending = 0`,
        [
          e.id,
          e.tambo_id,
          e.animal_id,
          e.type,
          e.event_at,
          e.product_name,
          e.milk_withdrawal_until,
          e.notes,
        ],
      );
    }
  });
}

export async function listActiveWithdrawalsLocal(
  tamboId: string,
): Promise<LocalHealthEvent[]> {
  const db = await getDb();
  const now = new Date().toISOString();
  return db.getAllAsync<LocalHealthEvent>(
    `SELECT h.*, a.ear_tag AS ear_tag
     FROM health_events_local h
     LEFT JOIN animals a ON a.id = h.animal_id
     WHERE h.tambo_id = ?
       AND h.milk_withdrawal_until IS NOT NULL
       AND h.milk_withdrawal_until >= ?
     ORDER BY h.milk_withdrawal_until ASC`,
    [tamboId, now],
  );
}

export async function enqueueOutbox(
  mutationId: string,
  entity: string,
  payload: unknown,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO outbox (mutation_id, entity, payload, created_at, status, last_error)
     VALUES (?, ?, ?, ?, 'pending', NULL)`,
    [mutationId, entity, JSON.stringify(payload), new Date().toISOString()],
  );
}

export async function listPendingOutbox(): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxRow>(
    "SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC",
  );
}

export type LocalMilkingSession = {
  id: string;
  tambo_id: string;
  session_date: string;
  shift: string;
  total_liters: number;
  pending: number;
};

export async function upsertLocalMilkingSession(
  session: LocalMilkingSession,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO milking_sessions_local
      (id, tambo_id, session_date, shift, total_liters, pending)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      session_date = excluded.session_date,
      shift = excluded.shift,
      total_liters = excluded.total_liters,
      pending = excluded.pending`,
    [
      session.id,
      session.tambo_id,
      session.session_date,
      session.shift,
      session.total_liters,
      session.pending,
    ],
  );
}

export async function listLocalMilkingSessions(
  tamboId: string,
): Promise<LocalMilkingSession[]> {
  const db = await getDb();
  return db.getAllAsync<LocalMilkingSession>(
    `SELECT * FROM milking_sessions_local
     WHERE tambo_id = ?
     ORDER BY session_date DESC, shift ASC`,
    [tamboId],
  );
}

export async function markOutboxSynced(mutationId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE outbox SET status = 'synced', last_error = NULL WHERE mutation_id = ?",
    [mutationId],
  );
  await db.runAsync(
    "UPDATE health_events_local SET pending = 0 WHERE id = ?",
    [mutationId],
  );
  await db.runAsync(
    "UPDATE milking_sessions_local SET pending = 0 WHERE id = ?",
    [mutationId],
  );
}

export async function markOutboxError(
  mutationId: string,
  error: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE outbox SET last_error = ? WHERE mutation_id = ?",
    [error, mutationId],
  );
}

export async function countPendingOutbox(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM outbox WHERE status = 'pending'",
  );
  return row?.c ?? 0;
}
