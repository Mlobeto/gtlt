/**
 * Habla solo con /device/* (nunca escribe en la base).
 * Requiere DEVICE_TOKEN. API_URL default http://localhost:3001.
 *
 *   npx tsx src/scripts/simulate-device.ts pump [--days N]
 *   npx tsx src/scripts/simulate-device.ts flow --bajada N
 */

const API_URL = (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const DEVICE_TOKEN = process.env.DEVICE_TOKEN?.trim() ?? "";

function usage(): never {
  console.error(`Uso:
  npx tsx src/scripts/simulate-device.ts pump [--days N]
  npx tsx src/scripts/simulate-device.ts flow --bajada N

Variables: API_URL (default http://localhost:3001), DEVICE_TOKEN (obligatoria).`);
  process.exit(1);
}

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  return args[i + 1];
}

async function deviceRequest<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Token": DEVICE_TOKEN,
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${res.status}`;
    const code =
      payload && typeof payload === "object" && "code" in payload
        ? String((payload as { code: unknown }).code)
        : undefined;
    throw new Error(code ? `${message} (${code})` : message);
  }
  return payload as T;
}

/** Argentina UTC-3 fijo. month 0-11. */
function artIso(year: number, month: number, day: number, hour: number, minute: number): string {
  return new Date(Date.UTC(year, month, day, hour + 3, minute, 0)).toISOString();
}

function jitterMinutes(baseHour: number, baseMinute: number): { hour: number; minute: number } {
  const total = baseHour * 60 + baseMinute + Math.floor(Math.random() * 31) - 15;
  const clamped = Math.max(0, Math.min(24 * 60 - 1, total));
  return { hour: Math.floor(clamped / 60), minute: clamped % 60 };
}

function artTodayParts(now = new Date()) {
  const shifted = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function addArtDays(parts: { year: number; month: number; day: number }, delta: number) {
  const utc = Date.UTC(parts.year, parts.month, parts.day + delta);
  const d = new Date(utc);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

type PumpEvent = { status: "ON" | "OFF"; occurredAt: string };

async function simulatePump(days: number) {
  const today = artTodayParts();
  const nowMs = Date.now();
  const events: PumpEvent[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = addArtDays(today, -offset);
    const morningOn = jitterMinutes(5, 0);
    const morningOff = jitterMinutes(7, 20);
    const afternoonOn = jitterMinutes(16, 30);
    const afternoonOff = jitterMinutes(18, 40);

    const slots = [
      { on: morningOn, off: morningOff },
      { on: afternoonOn, off: afternoonOff },
    ];

    for (const slot of slots) {
      let off = slot.off;
      if (off.hour * 60 + off.minute <= slot.on.hour * 60 + slot.on.minute) {
        off = { hour: slot.on.hour, minute: Math.min(59, slot.on.minute + 20) };
      }
      events.push({
        status: "ON",
        occurredAt: artIso(day.year, day.month, day.day, slot.on.hour, slot.on.minute),
      });
      events.push({
        status: "OFF",
        occurredAt: artIso(day.year, day.month, day.day, off.hour, off.minute),
      });
    }
  }

  events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  let sentOn = 0;
  let sentOff = 0;
  let skippedFuture = 0;

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const at = new Date(event.occurredAt).getTime();
    if (at > nowMs) {
      skippedFuture += 1;
      continue;
    }
    await deviceRequest("/device/pump-status", event);
    if (event.status === "ON") sentOn += 1;
    else sentOff += 1;
  }

  console.log(
    `Bomba: ${sentOn} ON y ${sentOff} OFF enviados (${days} día(s), ART UTC-3). Futuro omitido: ${skippedFuture}.`,
  );
}

async function simulateFlow(bajadaNumber: number) {
  const startedAt = new Date().toISOString();
  const opened = await deviceRequest<{ item: { id: string } }>("/device/flow-sessions", {
    bajadaNumber,
    startedAt,
  });

  const pulses = Array.from({ length: 40 }, (_, i) => {
    const t = 4.5 + (i / 39) * (30 - 4.5);
    const noise = (Math.random() - 0.5) * 0.6;
    return {
      sequence: i + 1,
      deltaTSeconds: Math.max(3, Number((t + noise).toFixed(2))),
    };
  });

  await deviceRequest(`/device/flow-sessions/${opened.item.id}/pulses`, { pulses });

  const endedAt = new Date().toISOString();
  const closed = await deviceRequest<{
    item: { id: string; pulseCount: number | null; estimatedLiters: unknown };
  }>(`/device/flow-sessions/${opened.item.id}/close`, { endedAt });

  console.log(
    `Caudalímetro bajada ${bajadaNumber}: sesión ${closed.item.id} cerrada. Pulsos: ${closed.item.pulseCount ?? pulses.length}. Litros est.: ${closed.item.estimatedLiters ?? "?"}.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "--help" || command === "-h") usage();

  if (!DEVICE_TOKEN) {
    console.error("Falta DEVICE_TOKEN.");
    usage();
  }

  console.warn(`Escribiendo en ${API_URL} (datos reales en esa API).`);

  if (command === "pump") {
    const rawDays = argValue(args, "--days");
    const days = rawDays ? Number(rawDays) : 2;
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      console.error("--days debe ser un entero entre 1 y 30.");
      process.exit(1);
    }
    await simulatePump(days);
    return;
  }

  if (command === "flow") {
    const rawBajada = argValue(args, "--bajada");
    const bajada = rawBajada ? Number(rawBajada) : NaN;
    if (!Number.isInteger(bajada) || bajada < 1) {
      console.error("--bajada es obligatorio y debe ser un entero >= 1.");
      process.exit(1);
    }
    await simulateFlow(bajada);
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
