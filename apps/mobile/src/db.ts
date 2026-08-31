import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  ddl: string,
) {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

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
          status TEXT NOT NULL,
          birth_date TEXT,
          entered_at TEXT,
          photo_url TEXT,
          photo_local_uri TEXT,
          notes TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          pending INTEGER NOT NULL DEFAULT 0
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
          pending INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          corrects_session_id TEXT
        );

        CREATE TABLE IF NOT EXISTS repro_events_local (
          id TEXT PRIMARY KEY NOT NULL,
          tambo_id TEXT NOT NULL,
          animal_id TEXT NOT NULL,
          type TEXT NOT NULL,
          event_at TEXT NOT NULL,
          expected_calving_at TEXT,
          notes TEXT,
          pending INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS milk_deliveries_local (
          id TEXT PRIMARY KEY NOT NULL,
          tambo_id TEXT NOT NULL,
          period_start TEXT NOT NULL,
          period_end TEXT NOT NULL,
          cold_tank_liters REAL NOT NULL,
          truck_declared_liters REAL NOT NULL,
          cold_tank_temperature_c REAL,
          truck_temperature_c REAL,
          notes TEXT,
          pending INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'ACTIVE'
        );

        CREATE TABLE IF NOT EXISTS control_lecheros_local (
          id TEXT PRIMARY KEY NOT NULL,
          tambo_id TEXT NOT NULL,
          performed_at TEXT NOT NULL,
          technician_name TEXT,
          notes TEXT,
          lines_json TEXT NOT NULL,
          pending INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'ACTIVE'
        );

        CREATE TABLE IF NOT EXISTS weight_events_local (
          id TEXT PRIMARY KEY NOT NULL,
          tambo_id TEXT NOT NULL,
          animal_id TEXT NOT NULL,
          weight_kg REAL NOT NULL,
          method TEXT NOT NULL DEFAULT 'VISUAL_ESTIMATE',
          measured_at TEXT NOT NULL,
          notes TEXT,
          pending INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS animal_photos_local (
          id TEXT PRIMARY KEY NOT NULL,
          tambo_id TEXT NOT NULL,
          animal_id TEXT NOT NULL,
          photo_local_uri TEXT NOT NULL,
          photo_url TEXT,
          type TEXT NOT NULL DEFAULT 'CONSULT',
          note TEXT,
          taken_at TEXT NOT NULL,
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

      await ensureColumn(
        db,
        "milking_sessions_local",
        "status",
        "status TEXT NOT NULL DEFAULT 'ACTIVE'",
      );
      await ensureColumn(
        db,
        "milking_sessions_local",
        "corrects_session_id",
        "corrects_session_id TEXT",
      );
      await ensureColumn(db, "animals", "birth_date", "birth_date TEXT");
      await ensureColumn(db, "animals", "entered_at", "entered_at TEXT");
      await ensureColumn(db, "animals", "photo_url", "photo_url TEXT");
      await ensureColumn(db, "animals", "photo_local_uri", "photo_local_uri TEXT");
      await ensureColumn(db, "animals", "notes", "notes TEXT");
      await ensureColumn(db, "animals", "breed", "breed TEXT");
      await ensureColumn(db, "animals", "mother_id", "mother_id TEXT");
      await ensureColumn(db, "animals", "sire_id", "sire_id TEXT");
      await ensureColumn(
        db,
        "animals",
        "version",
        "version INTEGER NOT NULL DEFAULT 1",
      );
      await ensureColumn(
        db,
        "animals",
        "pending",
        "pending INTEGER NOT NULL DEFAULT 0",
      );

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
  birth_date: string | null;
  entered_at: string | null;
  photo_url: string | null;
  photo_local_uri: string | null;
  notes: string | null;
  breed: string | null;
  mother_id: string | null;
  sire_id: string | null;
  version: number;
  pending: number;
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

export type LocalWeightEvent = {
  id: string;
  tambo_id: string;
  animal_id: string;
  weight_kg: number;
  method: string;
  measured_at: string;
  notes: string | null;
  pending: number;
  ear_tag?: string;
};

export type LocalAnimalPhoto = {
  id: string;
  tambo_id: string;
  animal_id: string;
  photo_local_uri: string;
  photo_url: string | null;
  type: string;
  note: string | null;
  taken_at: string;
  pending: number;
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
  animals: Omit<LocalAnimal, "pending" | "photo_local_uri">[],
): Promise<void> {
  const db = await getDb();
  const locals = await db.getAllAsync<{
    id: string;
    photo_local_uri: string | null;
    pending: number;
  }>("SELECT id, photo_local_uri, pending FROM animals WHERE tambo_id = ?", [
    tamboId,
  ]);
  const localById = new Map(locals.map((l) => [l.id, l]));

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM animals WHERE tambo_id = ? AND pending = 0",
      [tamboId],
    );
    for (const a of animals) {
      const prev = localById.get(a.id);
      if (prev?.pending === 1) continue;
      await db.runAsync(
        `INSERT INTO animals
          (id, tambo_id, ear_tag, status, birth_date, entered_at, photo_url,
           photo_local_uri, notes, breed, mother_id, sire_id, version, pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
          ear_tag = excluded.ear_tag,
          status = excluded.status,
          birth_date = excluded.birth_date,
          entered_at = excluded.entered_at,
          photo_url = excluded.photo_url,
          notes = excluded.notes,
          breed = excluded.breed,
          mother_id = excluded.mother_id,
          sire_id = excluded.sire_id,
          version = excluded.version,
          pending = 0,
          photo_local_uri = COALESCE(animals.photo_local_uri, excluded.photo_local_uri)`,
        [
          a.id,
          a.tambo_id,
          a.ear_tag,
          a.status,
          a.birth_date,
          a.entered_at,
          a.photo_url,
          prev?.photo_local_uri ?? null,
          a.notes,
          a.breed,
          a.mother_id,
          a.sire_id,
          a.version,
        ],
      );
    }
  });
}

export async function upsertLocalAnimal(animal: LocalAnimal): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO animals
      (id, tambo_id, ear_tag, status, birth_date, entered_at, photo_url,
       photo_local_uri, notes, breed, mother_id, sire_id, version, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      ear_tag = excluded.ear_tag,
      status = excluded.status,
      birth_date = excluded.birth_date,
      entered_at = excluded.entered_at,
      photo_url = excluded.photo_url,
      photo_local_uri = excluded.photo_local_uri,
      notes = excluded.notes,
      breed = excluded.breed,
      mother_id = excluded.mother_id,
      sire_id = excluded.sire_id,
      version = excluded.version,
      pending = excluded.pending`,
    [
      animal.id,
      animal.tambo_id,
      animal.ear_tag,
      animal.status,
      animal.birth_date,
      animal.entered_at,
      animal.photo_url,
      animal.photo_local_uri,
      animal.notes,
      animal.breed,
      animal.mother_id,
      animal.sire_id,
      animal.version,
      animal.pending,
    ],
  );
}

export async function listAnimals(tamboId: string): Promise<LocalAnimal[]> {
  const db = await getDb();
  return db.getAllAsync<LocalAnimal>(
    `SELECT * FROM animals
     WHERE tambo_id = ? AND status IN ('ACTIVE','DRY')
     ORDER BY ear_tag ASC`,
    [tamboId],
  );
}

export async function getLocalAnimal(id: string): Promise<LocalAnimal | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<LocalAnimal>("SELECT * FROM animals WHERE id = ?", [
      id,
    ])) ?? null
  );
}

export async function listHealthEventsForAnimal(
  animalId: string,
): Promise<LocalHealthEvent[]> {
  const db = await getDb();
  return db.getAllAsync<LocalHealthEvent>(
    `SELECT h.*, a.ear_tag AS ear_tag
     FROM health_events_local h
     LEFT JOIN animals a ON a.id = h.animal_id
     WHERE h.animal_id = ?
     ORDER BY h.event_at DESC`,
    [animalId],
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

export async function listWeightEventsForAnimal(
  animalId: string,
): Promise<LocalWeightEvent[]> {
  const db = await getDb();
  return db.getAllAsync<LocalWeightEvent>(
    `SELECT w.*, a.ear_tag AS ear_tag
     FROM weight_events_local w
     LEFT JOIN animals a ON a.id = w.animal_id
     WHERE w.animal_id = ?
     ORDER BY w.measured_at DESC`,
    [animalId],
  );
}

export async function upsertLocalWeightEvent(
  event: Omit<LocalWeightEvent, "ear_tag">,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO weight_events_local
      (id, tambo_id, animal_id, weight_kg, method, measured_at, notes, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      weight_kg = excluded.weight_kg,
      method = excluded.method,
      measured_at = excluded.measured_at,
      notes = excluded.notes,
      pending = excluded.pending`,
    [
      event.id,
      event.tambo_id,
      event.animal_id,
      event.weight_kg,
      event.method,
      event.measured_at,
      event.notes,
      event.pending,
    ],
  );
}

export async function markWeightEventSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE weight_events_local SET pending = 0 WHERE id = ?", [
    id,
  ]);
}

export async function listAnimalPhotosForAnimal(
  animalId: string,
): Promise<LocalAnimalPhoto[]> {
  const db = await getDb();
  return db.getAllAsync<LocalAnimalPhoto>(
    "SELECT * FROM animal_photos_local WHERE animal_id = ? ORDER BY taken_at DESC",
    [animalId],
  );
}

export async function upsertLocalAnimalPhoto(photo: LocalAnimalPhoto): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO animal_photos_local
      (id, tambo_id, animal_id, photo_local_uri, photo_url, type, note, taken_at, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      photo_url = excluded.photo_url,
      pending = excluded.pending`,
    [
      photo.id,
      photo.tambo_id,
      photo.animal_id,
      photo.photo_local_uri,
      photo.photo_url,
      photo.type,
      photo.note,
      photo.taken_at,
      photo.pending,
    ],
  );
}

export async function markAnimalPhotoSynced(id: string, photoUrl: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE animal_photos_local SET pending = 0, photo_url = ? WHERE id = ?",
    [photoUrl, id],
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
  status: string;
  corrects_session_id: string | null;
};

export async function upsertLocalMilkingSession(
  session: LocalMilkingSession,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO milking_sessions_local
      (id, tambo_id, session_date, shift, total_liters, pending, status, corrects_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      session_date = excluded.session_date,
      shift = excluded.shift,
      total_liters = excluded.total_liters,
      pending = excluded.pending,
      status = excluded.status,
      corrects_session_id = excluded.corrects_session_id`,
    [
      session.id,
      session.tambo_id,
      session.session_date,
      session.shift,
      session.total_liters,
      session.pending,
      session.status,
      session.corrects_session_id,
    ],
  );
}

export async function replaceSyncedMilkingSessions(
  tamboId: string,
  sessions: Omit<LocalMilkingSession, "pending">[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM milking_sessions_local WHERE tambo_id = ? AND pending = 0",
      [tamboId],
    );
    for (const s of sessions) {
      await db.runAsync(
        `INSERT INTO milking_sessions_local
          (id, tambo_id, session_date, shift, total_liters, pending, status, corrects_session_id)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          session_date = excluded.session_date,
          shift = excluded.shift,
          total_liters = excluded.total_liters,
          status = excluded.status,
          corrects_session_id = excluded.corrects_session_id,
          pending = CASE WHEN milking_sessions_local.pending = 1 THEN 1 ELSE 0 END`,
        [
          s.id,
          s.tambo_id,
          s.session_date,
          s.shift,
          s.total_liters,
          s.status,
          s.corrects_session_id,
        ],
      );
    }
  });
}

export async function listLocalMilkingSessions(
  tamboId: string,
): Promise<LocalMilkingSession[]> {
  const db = await getDb();
  return db.getAllAsync<LocalMilkingSession>(
    `SELECT * FROM milking_sessions_local
     WHERE tambo_id = ? AND status = 'ACTIVE'
     ORDER BY session_date DESC, shift ASC`,
    [tamboId],
  );
}

export async function findActiveMilkingSession(
  tamboId: string,
  sessionDate: string,
  shift: string,
): Promise<LocalMilkingSession | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<LocalMilkingSession>(
      `SELECT * FROM milking_sessions_local
       WHERE tambo_id = ? AND session_date = ? AND shift = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [tamboId, sessionDate, shift],
    )) ?? null
  );
}

export type LocalReproEvent = {
  id: string;
  tambo_id: string;
  animal_id: string;
  type: string;
  event_at: string;
  expected_calving_at: string | null;
  notes: string | null;
  pending: number;
  ear_tag?: string;
};

export async function upsertLocalReproEvent(
  event: Omit<LocalReproEvent, "ear_tag">,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO repro_events_local
      (id, tambo_id, animal_id, type, event_at, expected_calving_at, notes, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      event_at = excluded.event_at,
      expected_calving_at = excluded.expected_calving_at,
      notes = excluded.notes,
      pending = excluded.pending`,
    [
      event.id,
      event.tambo_id,
      event.animal_id,
      event.type,
      event.event_at,
      event.expected_calving_at,
      event.notes,
      event.pending,
    ],
  );
}

export async function listLocalReproEvents(
  tamboId: string,
): Promise<LocalReproEvent[]> {
  const db = await getDb();
  return db.getAllAsync<LocalReproEvent>(
    `SELECT r.*, a.ear_tag AS ear_tag
     FROM repro_events_local r
     LEFT JOIN animals a ON a.id = r.animal_id
     WHERE r.tambo_id = ?
     ORDER BY r.event_at DESC`,
    [tamboId],
  );
}

export async function listReproEventsForAnimal(
  animalId: string,
): Promise<LocalReproEvent[]> {
  const db = await getDb();
  return db.getAllAsync<LocalReproEvent>(
    `SELECT r.*, a.ear_tag AS ear_tag
     FROM repro_events_local r
     LEFT JOIN animals a ON a.id = r.animal_id
     WHERE r.animal_id = ?
     ORDER BY r.event_at DESC`,
    [animalId],
  );
}

export async function replaceSyncedReproEvents(
  tamboId: string,
  events: Omit<LocalReproEvent, "ear_tag" | "pending">[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM repro_events_local WHERE tambo_id = ? AND pending = 0",
      [tamboId],
    );
    for (const e of events) {
      await db.runAsync(
        `INSERT INTO repro_events_local
          (id, tambo_id, animal_id, type, event_at, expected_calving_at, notes, pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          event_at = excluded.event_at,
          expected_calving_at = excluded.expected_calving_at,
          notes = excluded.notes,
          pending = CASE WHEN repro_events_local.pending = 1 THEN 1 ELSE 0 END`,
        [
          e.id,
          e.tambo_id,
          e.animal_id,
          e.type,
          e.event_at,
          e.expected_calving_at,
          e.notes,
        ],
      );
    }
  });
}

export type LocalMilkDelivery = {
  id: string;
  tambo_id: string;
  period_start: string;
  period_end: string;
  cold_tank_liters: number;
  truck_declared_liters: number;
  cold_tank_temperature_c: number | null;
  truck_temperature_c: number | null;
  notes: string | null;
  pending: number;
  status: string;
};

export async function upsertLocalMilkDelivery(
  d: LocalMilkDelivery,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO milk_deliveries_local
      (id, tambo_id, period_start, period_end, cold_tank_liters, truck_declared_liters,
       cold_tank_temperature_c, truck_temperature_c, notes, pending, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      cold_tank_liters = excluded.cold_tank_liters,
      truck_declared_liters = excluded.truck_declared_liters,
      cold_tank_temperature_c = excluded.cold_tank_temperature_c,
      truck_temperature_c = excluded.truck_temperature_c,
      notes = excluded.notes,
      pending = excluded.pending,
      status = excluded.status`,
    [
      d.id,
      d.tambo_id,
      d.period_start,
      d.period_end,
      d.cold_tank_liters,
      d.truck_declared_liters,
      d.cold_tank_temperature_c,
      d.truck_temperature_c,
      d.notes,
      d.pending,
      d.status,
    ],
  );
}

export async function replaceSyncedMilkDeliveries(
  tamboId: string,
  items: Omit<LocalMilkDelivery, "pending">[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM milk_deliveries_local WHERE tambo_id = ? AND pending = 0",
      [tamboId],
    );
    for (const d of items) {
      await upsertLocalMilkDelivery({ ...d, pending: 0 });
    }
  });
}

export async function listLocalMilkDeliveries(
  tamboId: string,
): Promise<LocalMilkDelivery[]> {
  const db = await getDb();
  return db.getAllAsync<LocalMilkDelivery>(
    `SELECT * FROM milk_deliveries_local
     WHERE tambo_id = ? AND status = 'ACTIVE'
     ORDER BY period_end DESC`,
    [tamboId],
  );
}

export type LocalControlLechero = {
  id: string;
  tambo_id: string;
  performed_at: string;
  technician_name: string | null;
  notes: string | null;
  lines_json: string;
  pending: number;
  status: string;
};

export async function upsertLocalControlLechero(
  c: LocalControlLechero,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO control_lecheros_local
      (id, tambo_id, performed_at, technician_name, notes, lines_json, pending, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      performed_at = excluded.performed_at,
      technician_name = excluded.technician_name,
      notes = excluded.notes,
      lines_json = excluded.lines_json,
      pending = excluded.pending,
      status = excluded.status`,
    [
      c.id,
      c.tambo_id,
      c.performed_at,
      c.technician_name,
      c.notes,
      c.lines_json,
      c.pending,
      c.status,
    ],
  );
}

export async function replaceSyncedControlLecheros(
  tamboId: string,
  items: Omit<LocalControlLechero, "pending">[],
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM control_lecheros_local WHERE tambo_id = ? AND pending = 0",
      [tamboId],
    );
    for (const c of items) {
      await upsertLocalControlLechero({ ...c, pending: 0 });
    }
  });
}

export async function listLocalControlLecheros(
  tamboId: string,
): Promise<LocalControlLechero[]> {
  const db = await getDb();
  return db.getAllAsync<LocalControlLechero>(
    `SELECT * FROM control_lecheros_local
     WHERE tambo_id = ? AND status = 'ACTIVE'
     ORDER BY performed_at DESC`,
    [tamboId],
  );
}

export async function markOutboxSynced(mutationId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE outbox SET status = 'synced', last_error = NULL WHERE mutation_id = ?",
    [mutationId],
  );
  await db.runAsync("UPDATE health_events_local SET pending = 0 WHERE id = ?", [
    mutationId,
  ]);
  await db.runAsync(
    "UPDATE milking_sessions_local SET pending = 0 WHERE id = ?",
    [mutationId],
  );
  await db.runAsync("UPDATE repro_events_local SET pending = 0 WHERE id = ?", [
    mutationId,
  ]);
  await db.runAsync(
    "UPDATE milk_deliveries_local SET pending = 0 WHERE id = ?",
    [mutationId],
  );
  await db.runAsync(
    "UPDATE control_lecheros_local SET pending = 0 WHERE id = ?",
    [mutationId],
  );
  await db.runAsync("UPDATE animals SET pending = 0 WHERE id = ?", [mutationId]);
}

export async function markAnimalSynced(animalId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE animals SET pending = 0 WHERE id = ?", [animalId]);
}

/** Marca la foto local como ya subida — evita resubirla en cada sync. */
export async function markAnimalPhotoUrl(animalId: string, photoUrl: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE animals SET photo_url = ? WHERE id = ?", [photoUrl, animalId]);
}

export async function markOutboxError(
  mutationId: string,
  error: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE outbox SET last_error = ? WHERE mutation_id = ?", [
    error,
    mutationId,
  ]);
}

export async function countPendingOutbox(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM outbox WHERE status = 'pending'",
  );
  return row?.c ?? 0;
}
