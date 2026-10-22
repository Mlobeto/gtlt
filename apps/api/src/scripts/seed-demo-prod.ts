import { randomInt } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  DEMO_OWNER_NAME,
  DEMO_PROVIDER_NAME,
  DEMO_TENANT_NAME,
  EXTERNAL_SIRES,
  argentinaToday,
  buildDemoPlan,
  ownBullSireCode,
  type AnimalSpec,
  type DemoPlan,
  type TamboPlan,
} from "./demo-prod-plan.js";

const CONFIRM_LOAD = "CARGAR DEMO";
const CONFIRM_ARCHIVE = "ARCHIVAR DEMO";
const MAX_CONCURRENCY = 4;

type Json = Record<string, unknown>;

type Outcome = "created" | "exists" | "failed";

const stats = {
  created: 0,
  exists: 0,
  failed: 0,
  requests: 0,
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Falta la variable ${name}.`);
    process.exit(1);
  }
  return value;
}

function apiBase(): string {
  return (process.env.CAL_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

function apiHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(URL inválida)";
  }
}

function generateTemporaryPassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]!).join("");
}

function isDuplicateMessage(status: number, error: string): boolean {
  if (status !== 409) return false;
  const t = error.toLowerCase();
  return (
    t.includes("duplicate") ||
    t.includes("ya existe") ||
    t.includes("ya está activo") ||
    t.includes("already") ||
    t.includes("conflict")
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

class ApiClient {
  constructor(
    private base: string,
    private token: string | null = null,
  ) {}

  setToken(token: string | null) {
    this.token = token;
  }

  async request(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
    const maxAttempts = 6;
    let lastStatus = 0;
    let lastJson: Json = {};
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      stats.requests += 1;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      let res: Response;
      try {
        res = await fetch(`${this.base}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        if (attempt < maxAttempts - 1) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      lastStatus = res.status;
      const text = await res.text();
      try {
        lastJson = text ? (JSON.parse(text) as Json) : {};
      } catch {
        lastJson = { error: text.slice(0, 300) };
      }
      if (res.status === 429 || res.status >= 500) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return { status: res.status, json: lastJson };
    }
    return { status: lastStatus, json: lastJson };
  }
}

function errorText(json: Json): string {
  const err = json.error;
  if (typeof err === "string") return err.slice(0, 240);
  return "error";
}

function record(outcome: Outcome, path?: string, reason?: string) {
  stats[outcome] += 1;
  if (outcome === "failed") {
    console.error(`FALLÓ ${path}${reason ? ` · ${reason}` : ""}`);
  }
}

async function postCreate(
  api: ApiClient,
  path: string,
  body: unknown,
): Promise<{ outcome: Outcome; json: Json; status: number }> {
  const { status, json } = await api.request("POST", path, body);
  if (status === 200 || status === 201) {
    record("created");
    return { outcome: "created", json, status };
  }
  if (isDuplicateMessage(status, errorText(json))) {
    record("exists");
    return { outcome: "exists", json, status };
  }
  record("failed", `POST ${path}`, errorText(json));
  return { outcome: "failed", json, status };
}

async function mapPool<T>(items: T[], fn: (item: T) => Promise<void>) {
  let i = 0;
  const n = Math.min(MAX_CONCURRENCY, Math.max(1, items.length));
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        const item = items[idx];
        if (item !== undefined) await fn(item);
      }
    }),
  );
}

function printPlan(host: string, plan: DemoPlan) {
  console.log(`API: ${host}`);
  console.log(`Cuenta: ${plan.tenantName}`);
  console.log(`Tambos: ${plan.tambos.map((t) => t.name).join(", ")}`);
  console.log(
    `Plan de carga: ${plan.totals.tambos} tambos, ${plan.totals.cows} vacas + 2 toros propios, ` +
      `${plan.totals.repro} eventos repro, ${plan.totals.health} sanidad, ${plan.totals.weights} pesos, ` +
      `${plan.totals.controls} controles, ${plan.totals.milkings} ordeñes (${plan.totals.skippedTurns} turnos sin cargar), ` +
      `${plan.totals.deliveries} entregas (${plan.totals.largeDiffDeliveries} con diferencia grande).`,
  );
  console.log(`Altas de datos previstas (aprox.): ${plan.writeCount}`);
}

async function confirm(phrase: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`Escribí ${phrase} para continuar: `)).trim();
    return answer === phrase;
  } finally {
    rl.close();
  }
}

function itemId(json: Json): string | null {
  const item = json.item as Json | undefined;
  if (item && typeof item.id === "string") return item.id;
  if (typeof json.id === "string") return json.id;
  return null;
}

async function login(
  api: ApiClient,
  email: string,
  password: string,
  tenantId?: string,
): Promise<{ token: string; mustChangePassword: boolean; tenantId: string | null; userId: string | null }> {
  const body: Json = { email, password };
  if (tenantId) body.tenantId = tenantId;
  const { status, json } = await api.request("POST", "/auth/login", body);
  if (status === 400 && Array.isArray(json.tenants) && !tenantId) {
    const tenants = json.tenants as { id: string; name: string }[];
    const demo = tenants.find((t) => t.name === DEMO_TENANT_NAME);
    const pick = demo ?? tenants[0];
    if (!pick) {
      throw new Error("El ingreso pidió tenantId y no hay cuentas.");
    }
    return login(api, email, password, pick.id);
  }
  if (status !== 200 || typeof json.accessToken !== "string") {
    throw new Error(`Ingreso rechazado (${status})`);
  }
  const tenant = json.tenant as { id?: string } | undefined;
  const user = json.user as { id?: string } | undefined;
  return {
    token: json.accessToken,
    mustChangePassword: json.mustChangePassword === true,
    tenantId: typeof tenant?.id === "string" ? tenant.id : tenantId ?? null,
    userId: typeof user?.id === "string" ? user.id : null,
  };
}

async function ensureProvider(api: ApiClient): Promise<string> {
  const listed = await api.request("GET", "/admin/service-providers");
  const items = Array.isArray(listed.json.items) ? (listed.json.items as Json[]) : [];
  const found = items.find((p) => p.name === DEMO_PROVIDER_NAME);
  if (found && typeof found.id === "string") {
    record("exists");
    if (found.hasPanel === true) {
      const patched = await api.request("PATCH", `/admin/service-providers/${found.id}`, { hasPanel: false });
      if (patched.status >= 400) record("failed", `PATCH /admin/service-providers/${found.id}`, errorText(patched.json));
    }
    return found.id;
  }
  const created = await postCreate(api, "/admin/service-providers", { name: DEMO_PROVIDER_NAME });
  const id = itemId(created.json);
  if (!id) throw new Error("No se pudo crear el proveedor de demostración");
  await api.request("PATCH", `/admin/service-providers/${id}`, { hasPanel: false });
  return id;
}

function assertLifetimeDoesNotBill(plan: Json): void {
  const code = String(plan.code ?? "");
  const priceArs = Number(plan.priceArs ?? 0);
  const courtesy = code === "LIFETIME" || priceArs === 0;
  console.log(
    `Cobro: plan ${code || "?"} priceArs=${Number.isFinite(priceArs) ? priceArs : "?"} → ${courtesy ? "cortesía, no genera cobro" : "GENERA COBRO"}`,
  );
  if (!courtesy) {
    console.error("Freno: el plan LIFETIME (o el precio leído) generaría cobro. No activo tambos.");
    process.exit(2);
  }
}

async function findTenant(api: ApiClient): Promise<Json | null> {
  const listed = await api.request("GET", "/admin/tenants");
  const items = Array.isArray(listed.json.items) ? (listed.json.items as Json[]) : [];
  return items.find((t) => t.name === DEMO_TENANT_NAME) ?? null;
}

type TamboRef = { id: string; name: string; state?: string; activatedAt?: string | null };

function tambosOf(tenant: Json): TamboRef[] {
  const tambos = Array.isArray(tenant.tambos) ? (tenant.tambos as TamboRef[]) : [];
  return tambos;
}

async function ensureAccount(
  api: ApiClient,
  providerId: string,
  ownerEmail: string,
  initialPassword: string,
  plan: DemoPlan,
): Promise<{ tenantId: string; tambos: TamboRef[]; createdNow: boolean }> {
  const existing = await findTenant(api);
  const first = plan.tambos[0]!;
  const second = plan.tambos[1]!;
  const tamboBody = (t: TamboPlan) => ({
    name: t.name,
    bajadaCount: t.bajadaCount,
    powerSupply: t.powerSupply,
    pumpCount: t.pumpCount,
    defaultServiceProviderId: providerId,
    equipmentProductIds: [] as string[],
  });

  if (!existing || typeof existing.id !== "string") {
    const created = await postCreate(api, "/admin/tenants", {
      tenantName: DEMO_TENANT_NAME,
      ownerName: DEMO_OWNER_NAME,
      ownerEmail,
      ownerPassword: initialPassword,
      planCode: "LIFETIME",
      tambo: tamboBody(first),
    });
    if (created.outcome === "exists") {
      const again = await findTenant(api);
      if (again && typeof again.id === "string") {
        return { tenantId: again.id, tambos: tambosOf(again), createdNow: false };
      }
      throw new Error("Ese correo de dueño ya existe y no aparece la cuenta [DEMO].");
    }
    if (created.outcome === "failed") throw new Error("No se pudo crear la cuenta de demostración");
    const tenant = created.json.tenant as Json | undefined;
    const tenantId = typeof tenant?.id === "string" ? tenant.id : null;
    if (!tenantId) throw new Error("La cuenta se creó sin id");
    await postCreate(api, `/admin/tenants/${tenantId}/tambos`, tamboBody(second));
    const again = await findTenant(api);
    if (!again || typeof again.id !== "string") throw new Error("No se encontró la cuenta recién creada");
    return { tenantId: again.id, tambos: tambosOf(again), createdNow: true };
  }

  record("exists");
  const tenantId = existing.id;
  const tambos = tambosOf(existing);
  if (!tambos.some((t) => t.name === second.name)) {
    await postCreate(api, `/admin/tenants/${tenantId}/tambos`, tamboBody(second));
  } else {
    record("exists");
  }
  if (!tambos.some((t) => t.name === first.name)) {
    await postCreate(api, `/admin/tenants/${tenantId}/tambos`, tamboBody(first));
  }
  const again = await findTenant(api);
  return {
    tenantId,
    tambos: again ? tambosOf(again) : tambos,
    createdNow: false,
  };
}

async function activateTambos(api: ApiClient, tambos: TamboRef[]) {
  for (const t of tambos) {
    const alreadyOn = t.state === "ACTIVE" || t.activatedAt != null;
    if (alreadyOn) {
      record("exists");
      continue;
    }
    const { status, json } = await api.request("POST", `/admin/tambos/${t.id}/activate`);
    if (status === 200 || status === 201) record("created");
    else if (isDuplicateMessage(status, errorText(json))) record("exists");
    else record("failed", `POST /admin/tambos/${t.id}/activate`, errorText(json));
  }
}

async function listAnimals(api: ApiClient, tamboId: string): Promise<Json[]> {
  const statuses: Array<string | undefined> = [undefined, "SOLD"];
  const all: Json[] = [];
  const seen = new Set<string>();
  for (const status of statuses) {
    const q = status ? `/animals?tamboId=${tamboId}&status=${status}` : `/animals?tamboId=${tamboId}`;
    const { json } = await api.request("GET", q);
    const items = Array.isArray(json.items) ? (json.items as Json[]) : [];
    for (const it of items) {
      if (typeof it.id === "string" && !seen.has(it.id)) {
        seen.add(it.id);
        all.push(it);
      }
    }
  }
  return all;
}

async function ensureSire(
  api: ApiClient,
  existing: Json[],
  name: string,
  registrationCode: string,
  extra: { isExternal: boolean; linkedAnimalId?: string },
): Promise<string | null> {
  const found = existing.find((s) => s.registrationCode === registrationCode || s.name === name);
  if (found && typeof found.id === "string") {
    record("exists");
    return found.id;
  }
  const created = await postCreate(api, "/sires", {
    name,
    registrationCode,
    isExternal: extra.isExternal,
    ...(extra.linkedAnimalId ? { linkedAnimalId: extra.linkedAnimalId } : {}),
  });
  const id = itemId(created.json);
  if (id) existing.push({ id, name, registrationCode });
  return id;
}

async function loadTambo(
  api: ApiClient,
  tamboId: string,
  t: TamboPlan,
  sireIds: Map<string, string>,
  done: { n: number },
  total: number,
) {
  const tick = () => {
    done.n += 1;
    if (done.n % 10 === 0 || done.n === total) {
      output.write(`\rProgreso ${done.n}/${total}`);
    }
  };

  await mapPool(t.animals, async (animal) => {
    const result = await postCreate(api, "/animals", {
      id: animal.id,
      tamboId,
      earTag: animal.earTag,
      status: animal.status,
      birthDate: animal.birthDate,
      breed: animal.breed,
      clientMutationId: animal.clientMutationId,
    });
    tick();
    if (result.outcome === "failed") return;
  });

  const listed = await listAnimals(api, tamboId);
  const byTag = new Map<string, string>();
  for (const a of listed) {
    if (typeof a.earTag === "string" && typeof a.id === "string") byTag.set(a.earTag, a.id);
  }
  for (const animal of t.animals) {
    if (!byTag.has(animal.earTag)) byTag.set(animal.earTag, animal.id);
  }

  const bullAnimalId = byTag.get(t.bull.earTag);
  const siresRes = await api.request("GET", "/sires");
  const sireItems = Array.isArray(siresRes.json.items) ? (siresRes.json.items as Json[]) : [];
  const ownCode = ownBullSireCode(t.slug);
  const ownId = await ensureSire(api, sireItems, `Toro propio ${t.name}`, ownCode, {
    isExternal: false,
    linkedAnimalId: bullAnimalId,
  });
  if (ownId) sireIds.set(ownCode, ownId);
  tick();

  const patches = t.animals.filter((a) => a.motherEarTag || a.sireCode);
  await mapPool(patches, async (animal) => {
    const id = byTag.get(animal.earTag);
    if (!id) {
      record("failed", `PATCH /animals/${animal.earTag}`, "animal no encontrado");
      tick();
      return;
    }
    const motherId = animal.motherEarTag ? byTag.get(animal.motherEarTag) : undefined;
    const sireId = animal.sireCode ? sireIds.get(animal.sireCode) : undefined;
    const { status, json } = await api.request("PATCH", `/animals/${id}`, {
      ...(motherId ? { motherId } : {}),
      ...(sireId ? { sireId } : {}),
    });
    if (status >= 400) record("failed", `PATCH /animals/${id}`, errorText(json));
    else record("created");
    tick();
  });

  await mapPool(t.repro, async (ev) => {
    const animalId = byTag.get(ev.earTag);
    if (!animalId) {
      record("failed", "POST /repro-events", `sin animal ${ev.earTag}`);
      tick();
      return;
    }
    const body: Json = {
      id: ev.id,
      tamboId,
      animalId,
      type: ev.type,
      eventAt: ev.eventAt,
      clientMutationId: ev.clientMutationId,
    };
    if ((ev.type === "SERVICE" || ev.type === "EXPECTED_CALVING") && ev.expectedCalvingAt) {
      body.expectedCalvingAt = ev.expectedCalvingAt;
    }
    await postCreate(api, "/repro-events", body);
    tick();
  });

  await mapPool(t.health, async (ev) => {
    const animalId = byTag.get(ev.earTag);
    if (!animalId) {
      record("failed", "POST /health-events", `sin animal ${ev.earTag}`);
      tick();
      return;
    }
    await postCreate(api, "/health-events", {
      id: ev.id,
      tamboId,
      animalId,
      type: ev.type,
      eventAt: ev.eventAt,
      productName: ev.productName,
      milkWithdrawalUntil: ev.milkWithdrawalUntil,
      clientMutationId: ev.clientMutationId,
    });
    tick();
  });

  await mapPool(t.weights, async (ev) => {
    const animalId = byTag.get(ev.earTag);
    if (!animalId) {
      record("failed", "POST /weight-events", `sin animal ${ev.earTag}`);
      tick();
      return;
    }
    await postCreate(api, "/weight-events", {
      id: ev.id,
      tamboId,
      animalId,
      weightKg: ev.weightKg,
      method: "SCALE",
      measuredAt: ev.measuredAt,
      clientMutationId: ev.clientMutationId,
    });
    tick();
  });

  for (const ctrl of t.controls) {
    const lines = ctrl.lines
      .map((ln) => {
        const animalId = byTag.get(ln.earTag);
        if (!animalId) return null;
        return { animalId, bajadaNumber: ln.bajadaNumber, liters: ln.liters };
      })
      .filter((ln): ln is { animalId: string; bajadaNumber: number; liters: number } => ln != null);
    if (lines.length === 0) {
      record("failed", "POST /control-lecheros", "sin líneas");
      tick();
      continue;
    }
    await postCreate(api, "/control-lecheros", {
      id: ctrl.id,
      tamboId,
      performedAt: ctrl.performedAt,
      source: "EXTERNAL_TECHNICIAN",
      technicianName: "Control demo",
      clientMutationId: ctrl.clientMutationId,
      lines,
    });
    tick();
  }

  await mapPool(t.milkings, async (m) => {
    await postCreate(api, "/milking-sessions", {
      id: m.id,
      tamboId,
      sessionDate: m.sessionDate,
      shift: m.shift,
      totalLiters: m.totalLiters,
      clientMutationId: m.clientMutationId,
    });
    tick();
  });

  for (const d of t.deliveries) {
    await postCreate(api, "/milk-deliveries", {
      id: d.id,
      tamboId,
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      coldTankLiters: d.coldTankLiters,
      truckDeclaredLiters: d.truckDeclaredLiters,
      pickupDate: d.pickupDate,
      pickupShift: d.pickupShift,
      guacheraLiters: d.guacheraLiters,
      clientMutationId: d.clientMutationId,
    });
    tick();
  }

  if (t.thresholdPct != null) {
    const { status, json } = await api.request("PATCH", `/tambos/${tamboId}/settings`, {
      deliveryDiffThresholdPct: t.thresholdPct,
    });
    if (status >= 400) record("failed", `PATCH /tambos/${tamboId}/settings`, errorText(json));
    else record("created");
    tick();
  }
}

async function archiveDemo(api: ApiClient, tambos: TamboRef[]) {
  for (const t of tambos) {
    const { status, json } = await api.request("PATCH", `/tambos/${t.id}/active`, { active: false });
    if (status === 200) {
      record("created");
      console.log(`Archivado: ${t.name}`);
    } else if (isDuplicateMessage(status, errorText(json))) {
      record("exists");
      console.log(`Ya archivado o bloqueado: ${t.name} · ${errorText(json)}`);
    } else {
      record("failed", `PATCH /tambos/${t.id}/active`, errorText(json));
    }
  }
}

function printSummary() {
  output.write("\n");
  console.log(
    `Resumen: creados=${stats.created} ya existentes=${stats.exists} fallidos=${stats.failed} solicitudes=${stats.requests}`,
  );
  console.log(`Tambos: ${DEMO_TENANT_NAME} → Los Ceibos, La Aurora`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const archive = args.has("--archive");
  const plan = buildDemoPlan(argentinaToday());
  const base = apiBase();
  const host = apiHost(base);

  printPlan(host, plan);

  if (dryRun) {
    console.log("Dry-run: no se escribió nada ni se llamó a la red.");
    return;
  }

  const ownerEmail = requireEnv("CAL_DEMO_OWNER_EMAIL");
  const ownerPassword = requireEnv("CAL_DEMO_OWNER_PASSWORD");
  if (ownerPassword.length < 8) {
    console.error("CAL_DEMO_OWNER_PASSWORD tiene que tener al menos 8 caracteres.");
    process.exit(1);
  }
  const devEmail = requireEnv("CAL_DEV_EMAIL");
  const devPassword = requireEnv("CAL_DEV_PASSWORD");

  const phrase = archive ? CONFIRM_ARCHIVE : CONFIRM_LOAD;
  if (!(await confirm(phrase))) {
    console.log("Cancelado.");
    process.exit(1);
  }

  const api = new ApiClient(base);
  const dev = await login(api, devEmail, devPassword);
  api.setToken(dev.token);

  const plansRes = await api.request("GET", "/admin/plans");
  const plans = Array.isArray(plansRes.json.items) ? (plansRes.json.items as Json[]) : [];
  const lifetime = plans.find((p) => p.code === "LIFETIME");
  if (!lifetime) {
    console.error("No está el plan LIFETIME en GET /admin/plans. Freno.");
    process.exit(2);
  }
  assertLifetimeDoesNotBill(lifetime);

  const providerId = await ensureProvider(api);
  const initialPassword = generateTemporaryPassword();
  const account = await ensureAccount(api, providerId, ownerEmail, initialPassword, plan);
  const wanted = plan.tambos.map((t) => t.name);
  const tamboRefs = account.tambos.filter((t) => wanted.includes(t.name));
  if (tamboRefs.length < 2) {
    throw new Error("Faltan tambos de demostración en la cuenta");
  }

  await activateTambos(api, tamboRefs);

  if (archive) {
    const owner = await login(api, ownerEmail, ownerPassword, account.tenantId);
    api.setToken(owner.token);
    await archiveDemo(api, tamboRefs);
    printSummary();
    if (stats.failed > 0) process.exit(1);
    return;
  }

  if (account.createdNow) {
    const first = await login(api, ownerEmail, initialPassword, account.tenantId);
    api.setToken(first.token);
    const changed = await api.request("POST", "/auth/change-password", {
      currentPassword: initialPassword,
      newPassword: ownerPassword,
    });
    if (changed.status >= 400) {
      throw new Error("No se pudo cambiar la clave inicial del dueño");
    }
    const token =
      typeof changed.json.accessToken === "string" ? changed.json.accessToken : null;
    if (token) api.setToken(token);
    else {
      const again = await login(api, ownerEmail, ownerPassword, account.tenantId);
      api.setToken(again.token);
    }
  } else {
    const owner = await login(api, ownerEmail, ownerPassword, account.tenantId);
    api.setToken(owner.token);
  }

  const siresRes = await api.request("GET", "/sires");
  const sireItems = Array.isArray(siresRes.json.items) ? (siresRes.json.items as Json[]) : [];
  const sireIds = new Map<string, string>();
  for (const s of EXTERNAL_SIRES) {
    const id = await ensureSire(api, sireItems, s.name, s.registrationCode, { isExternal: true });
    if (id) sireIds.set(s.registrationCode, id);
  }

  const total =
    plan.tambos.reduce(
      (n, t) =>
        n +
        t.animals.length +
        1 +
        t.animals.filter((a: AnimalSpec) => a.motherEarTag || a.sireCode).length +
        t.repro.length +
        t.health.length +
        t.weights.length +
        t.controls.length +
        t.milkings.length +
        t.deliveries.length +
        (t.thresholdPct != null ? 1 : 0),
      0,
    );
  const done = { n: 0 };
  for (const t of plan.tambos) {
    const ref = tamboRefs.find((x) => x.name === t.name);
    if (!ref) {
      record("failed", "tambo", `no está ${t.name}`);
      continue;
    }
    await loadTambo(api, ref.id, t, sireIds, done, total);
  }

  printSummary();
  if (stats.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Error");
  process.exit(1);
});
