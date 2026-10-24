import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { createInvite } from "../lib/invites.js";
import { clearAccessCacheForTests } from "../lib/access-session.js";
import type { Role } from "@prisma/client";

process.env.ACCESS_CACHE_TTL_MS = "0";

let failed = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`OK  ${name}${detail ? ` · ${detail}` : ""}`);
  else {
    failed += 1;
    console.log(`FALLÓ  ${name}${detail ? ` · ${detail}` : ""}`);
  }
}

async function jsonOf(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function signToken(input: {
  userId: string;
  tenantId: string;
  roles: Role[];
  tamboIds: string[] | null;
  iat?: number;
  noTimestamp?: boolean;
}) {
  const payload = {
    sub: input.userId,
    tenantId: input.tenantId,
    roles: input.roles,
    tamboIds: input.tamboIds,
    serviceProviderId: null,
    mustChangePassword: false,
    ...(input.iat !== undefined ? { iat: input.iat } : {}),
  };
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: "7d",
    ...(input.noTimestamp ? { noTimestamp: true } : {}),
  });
}

async function main() {
  const app = createApp();
  const server = app.listen(0);
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No se pudo abrir el servidor de prueba");
  const base = `http://127.0.0.1:${addr.port}`;

  const suffix = Date.now().toString(36);
  const n = String(Date.now() % 9_000_000).padStart(7, "0");
  const ownerPass = "clave-duenio-1";
  const ownerHash = await bcrypt.hash(ownerPass, 10);
  const memberPass = "clave-tambero-1";
  const memberHash = await bcrypt.hash(memberPass, 10);

  const tenantA = await prisma.tenant.create({ data: { name: `[TEST] madmin A ${suffix}` } });
  const tenantB = await prisma.tenant.create({ data: { name: `[TEST] madmin B ${suffix}` } });
  const tamboA = await prisma.tambo.create({
    data: { tenantId: tenantA.id, name: `[TEST] tambo A ${suffix}`, bajadaCount: 8, activatedAt: new Date() },
  });
  const tamboA2 = await prisma.tambo.create({
    data: { tenantId: tenantA.id, name: `[TEST] tambo A2 ${suffix}`, bajadaCount: 8, activatedAt: new Date() },
  });
  const tamboB = await prisma.tambo.create({
    data: { tenantId: tenantB.id, name: `[TEST] tambo B ${suffix}`, bajadaCount: 8, activatedAt: new Date() },
  });

  const ownerA = await prisma.user.create({
    data: { email: `madmin-owner-a-${suffix}@demo.local`, name: "Dueño A", passwordHash: ownerHash },
  });
  const ownerB = await prisma.user.create({
    data: { email: `madmin-owner-b-${suffix}@demo.local`, name: "Dueño B", passwordHash: ownerHash },
  });
  await prisma.membership.create({
    data: { tenantId: tenantA.id, userId: ownerA.id, roles: ["DUENIO"], status: "ACTIVE" },
  });
  await prisma.membership.create({
    data: { tenantId: tenantB.id, userId: ownerB.id, roles: ["DUENIO"], status: "ACTIVE" },
  });

  const login = async (body: unknown) => {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await jsonOf(res) };
  };
  const authed = async (token: string, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = res.status === 204 ? {} : await jsonOf(res);
    return { status: res.status, json };
  };

  try {
    const loginA = await login({ identifier: ownerA.email, password: ownerPass, tenantId: tenantA.id });
    const tokenA = String(loginA.json.accessToken ?? "");
    check("login dueño A", loginA.status === 200 && tokenA.length > 10);
    const loginB = await login({ identifier: ownerB.email, password: ownerPass, tenantId: tenantB.id });
    const tokenB = String(loginB.json.accessToken ?? "");
    check("login dueño B", loginB.status === 200);

    const meOk = await authed(tokenA, "GET", "/auth/me");
    check("pase válido funciona", meOk.status === 200);

    const tambero = await prisma.user.create({
      data: {
        email: `madmin-tb-${suffix}@demo.local`,
        phone: `+549351${n}`,
        name: "Tambero marca",
        passwordHash: memberHash,
      },
    });
    const memTb = await prisma.membership.create({
      data: {
        tenantId: tenantA.id,
        userId: tambero.id,
        roles: ["TAMBERO"],
        status: "ACTIVE",
        tambos: { create: { tenantId: tenantA.id, tamboId: tamboA.id } },
      },
    });
    const oldIat = Math.floor(Date.now() / 1000) - 30;
    const oldTok = signToken({
      userId: tambero.id,
      tenantId: tenantA.id,
      roles: ["TAMBERO"],
      tamboIds: [tamboA.id],
      iat: oldIat,
    });
    await prisma.membership.update({
      where: { id: memTb.id },
      data: { sessionsValidAfter: new Date() },
    });
    clearAccessCacheForTests();
    const revokedOld = await authed(oldTok, "GET", "/auth/me");
    check(
      "pase anterior a sessionsValidAfter → SESSION_REVOKED",
      revokedOld.status === 401 && revokedOld.json.code === "SESSION_REVOKED",
      String(revokedOld.status),
    );
    const newTok = signToken({
      userId: tambero.id,
      tenantId: tenantA.id,
      roles: ["TAMBERO"],
      tamboIds: [tamboA.id],
      iat: Math.floor(Date.now() / 1000) + 1,
    });
    const afterOk = await authed(newTok, "GET", "/auth/me");
    check("pase posterior funciona", afterOk.status === 200, String(afterOk.status));

    const phoneShared = `351 ${String((Number(n) + 11) % 10_000_000).padStart(7, "0")}`;
    const created = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "Tambero baja",
      phone: phoneShared,
      role: "TAMBERO",
    });
    const createdItem = created.json.item as { id?: string; user?: { id?: string } } | undefined;
    const createdTemp = String(created.json.temporaryPassword ?? "");
    const createdLogin = await login({
      identifier: phoneShared,
      password: createdTemp,
      tenantId: tenantA.id,
    });
    const createdToken = String(createdLogin.json.accessToken ?? "");
    check("tambero creado e ingresó", created.status === 201 && createdLogin.status === 200);

    await prisma.membership.create({
      data: {
        tenantId: tenantB.id,
        userId: createdItem?.user?.id ?? "",
        roles: ["TAMBERO"],
        status: "ACTIVE",
        tambos: { create: { tenantId: tenantB.id, tamboId: tamboB.id } },
      },
    });
    const loginOther = await login({
      identifier: phoneShared,
      password: createdTemp,
      tenantId: tenantB.id,
    });
    const tokenOther = String(loginOther.json.accessToken ?? "");
    check("ingreso al otro tenant", loginOther.status === 200);
    await sleep(1100);

    if (createdItem?.user?.id) {
      await prisma.animal.create({
        data: {
          tenantId: tenantA.id,
          tamboId: tamboA.id,
          earTag: `T${suffix.slice(-4)}`,
          createdById: createdItem.user.id,
        },
      });
    }

    const revoked = await authed(tokenA, "POST", `/memberships/${createdItem?.id}/revoke`);
    check("dar de baja 200", revoked.status === 200 && (revoked.json.item as { status?: string })?.status === "REVOKED", String(revoked.status));
    const oldAfterRevoke = await authed(createdToken, "GET", "/auth/me");
    check(
      "pase de ese tenant rechazado",
      oldAfterRevoke.status === 401 && oldAfterRevoke.json.code === "SESSION_REVOKED",
      String(oldAfterRevoke.status),
    );
    const loginRevoked = await login({ identifier: phoneShared, password: createdTemp, tenantId: tenantA.id });
    check("ingreso a ese tenant falla", loginRevoked.status === 403, String(loginRevoked.status));
    const otherStill = await authed(tokenOther, "GET", "/auth/me");
    check("sesiones en el otro tenant siguen", otherStill.status === 200, String(otherStill.status));
    const userStill = await prisma.user.findUnique({ where: { id: createdItem?.user?.id ?? "" } });
    const animalStill = await prisma.animal.count({
      where: { createdById: createdItem?.user?.id ?? "", deletedAt: null },
    });
    check("usuario y registros siguen", Boolean(userStill) && animalStill >= 1);

    const reactivated = await authed(tokenA, "POST", `/memberships/${createdItem?.id}/reactivate`);
    check("reactivar 200", reactivated.status === 200 && (reactivated.json.item as { status?: string })?.status === "ACTIVE", String(reactivated.status));
    const loginAgain = await login({ identifier: phoneShared, password: createdTemp, tenantId: tenantA.id });
    check("tras reactivar puede ingresar", loginAgain.status === 200, String(loginAgain.status));

    const soloPhone = `351 ${String((Number(n) + 12) % 10_000_000).padStart(7, "0")}`;
    const solo = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "Solo este tenant",
      phone: soloPhone,
      role: "TAMBERO",
    });
    const soloItem = solo.json.item as { id?: string; user?: { id?: string } } | undefined;
    const soloTemp = String(solo.json.temporaryPassword ?? "");
    const soloLogin = await login({ identifier: soloPhone, password: soloTemp, tenantId: tenantA.id });
    const soloToken = String(soloLogin.json.accessToken ?? "");
    await sleep(1100);
    const rolePatch = await authed(tokenA, "PATCH", `/memberships/${soloItem?.id}`, { role: "VETERINARIO" });
    check("cambiar rol 200", rolePatch.status === 200, String(rolePatch.status));
    const roleCut = await authed(soloToken, "GET", "/auth/me");
    check("cambiar rol corta sesión", roleCut.status === 401 && roleCut.json.code === "SESSION_REVOKED");

    const soloLogin2 = await login({ identifier: soloPhone, password: soloTemp, tenantId: tenantA.id });
    const soloToken2 = String(soloLogin2.json.accessToken ?? "");
    await sleep(1100);
    const tambosPatch = await authed(tokenA, "PATCH", `/memberships/${soloItem?.id}`, {
      tamboIds: [tamboA.id, tamboA2.id],
    });
    check("cambiar tambos 200", tambosPatch.status === 200);
    const tambosCut = await authed(soloToken2, "GET", "/auth/me");
    check("cambiar tambos corta sesión", tambosCut.status === 401 && tambosCut.json.code === "SESSION_REVOKED");

    const soloLogin3 = await login({ identifier: soloPhone, password: soloTemp, tenantId: tenantA.id });
    const soloToken3 = String(soloLogin3.json.accessToken ?? "");
    const namePatch = await authed(tokenA, "PATCH", `/memberships/${soloItem?.id}`, { name: "Nombre nuevo" });
    check("cambiar solo nombre 200", namePatch.status === 200);
    const nameKeep = await authed(soloToken3, "GET", "/auth/me");
    check("cambiar solo nombre no corta", nameKeep.status === 200, String(nameKeep.status));

    const sharedName = await authed(tokenA, "PATCH", `/memberships/${createdItem?.id}`, { name: "No se puede" });
    check(
      "editar nombre cuenta compartida → SHARED_ACCOUNT",
      sharedName.status === 409 && sharedName.json.code === "SHARED_ACCOUNT",
      String(sharedName.status),
    );
    const taken = await authed(tokenA, "PATCH", `/memberships/${soloItem?.id}`, {
      email: ownerA.email ?? undefined,
    });
    check(
      "teléfono/correo de otro → IDENTITY_TAKEN",
      taken.status === 409 && taken.json.code === "IDENTITY_TAKEN",
      String(taken.status),
    );
    const wipeIds = await authed(tokenA, "PATCH", `/memberships/${soloItem?.id}`, { email: "", phone: "" });
    check("no dejar sin correo ni teléfono", wipeIds.status === 400, String(wipeIds.status));

    const invite = await createInvite({
      tenantId: tenantA.id,
      tamboId: tamboA.id,
      email: `madmin-orphan-${suffix}@demo.local`,
      name: "Huérfano",
      role: "TAMBERO",
    });
    const orphanId = invite.item.user.id;
    const cancel = await authed(tokenA, "POST", `/memberships/${invite.item.id}/cancel-invite`);
    check("cancelar invitación 204", cancel.status === 204, String(cancel.status));
    const orphanGone = await prisma.user.findUnique({ where: { id: orphanId } });
    const memGone = await prisma.membership.findUnique({ where: { id: invite.item.id } });
    check("borra membresía y usuario huérfano", !orphanGone && !memGone);

    const keptInvite = await createInvite({
      tenantId: tenantA.id,
      tamboId: tamboA.id,
      email: `madmin-kept-${suffix}@demo.local`,
      name: "Con clave",
      role: "TAMBERO",
    });
    await prisma.user.update({
      where: { id: keptInvite.item.user.id },
      data: { passwordHash: memberHash },
    });
    const cancelKept = await authed(tokenA, "POST", `/memberships/${keptInvite.item.id}/cancel-invite`);
    const keptUser = await prisma.user.findUnique({ where: { id: keptInvite.item.user.id } });
    check("no borra usuario con clave", cancelKept.status === 204 && Boolean(keptUser));

    const memOwner = await prisma.membership.findFirst({
      where: { tenantId: tenantA.id, userId: ownerA.id },
    });
    const revSelf = await authed(tokenA, "POST", `/memberships/${memOwner?.id}/revoke`);
    check("no dar de baja a uno mismo", revSelf.status === 403, String(revSelf.status));

    const adminU = await prisma.user.create({
      data: { email: `madmin-admin-${suffix}@demo.local`, name: "Admin", passwordHash: memberHash },
    });
    const memAdmin = await prisma.membership.create({
      data: { tenantId: tenantA.id, userId: adminU.id, roles: ["ADMIN"], status: "ACTIVE" },
    });
    const techU = await prisma.user.create({
      data: { email: `madmin-tech-${suffix}@demo.local`, name: "Técnico", passwordHash: memberHash },
    });
    const memTech = await prisma.membership.create({
      data: { tenantId: tenantA.id, userId: techU.id, roles: ["TECNICO"], status: "ACTIVE" },
    });
    const revOwner = await authed(tokenA, "POST", `/memberships/${memOwner?.id}/revoke`);
    const revAdmin = await authed(tokenA, "POST", `/memberships/${memAdmin.id}/revoke`);
    const revTech = await authed(tokenA, "POST", `/memberships/${memTech.id}/revoke`);
    check("no dar de baja dueño", revOwner.status === 403);
    check("no dar de baja admin", revAdmin.status === 403);
    check("no dar de baja técnico", revTech.status === 403);

    const cross = await authed(tokenB, "POST", `/memberships/${soloItem?.id}/revoke`);
    check("dueño de otro tenant → 404", cross.status === 404, String(cross.status));

    const tamberoTokLogin = await login({ identifier: soloPhone, password: soloTemp, tenantId: tenantA.id });
    const tamberoTok = String(tamberoTokLogin.json.accessToken ?? "");
    const asTambero = await authed(tamberoTok, "POST", `/memberships/${memTb.id}/revoke`);
    check("tambero que llama → 403", asTambero.status === 403, String(asTambero.status));

    const resetTokLogin = await login({ identifier: soloPhone, password: soloTemp, tenantId: tenantA.id });
    const beforeReset = String(resetTokLogin.json.accessToken ?? "");
    await sleep(1100);
    const reset = await authed(tokenA, "POST", `/memberships/${soloItem?.id}/reset-password`);
    const newPass = String(reset.json.temporaryPassword ?? "");
    const afterResetOld = await authed(beforeReset, "GET", "/auth/me");
    check(
      "restablecer clave corta pases",
      afterResetOld.status === 401 && afterResetOld.json.code === "SESSION_REVOKED",
      String(afterResetOld.status),
    );
    const afterResetLogin = await login({ identifier: soloPhone, password: newPass, tenantId: tenantA.id });
    check("ingreso con clave nueva", afterResetLogin.status === 200);

    const changeLogin = await login({ identifier: soloPhone, password: newPass, tenantId: tenantA.id });
    const changeTok = String(changeLogin.json.accessToken ?? "");
    await sleep(1100);
    const changed = await authed(changeTok, "POST", "/auth/change-password", {
      currentPassword: newPass,
      newPassword: "clave-nueva-99",
    });
    const brandNew = String(changed.json.accessToken ?? "");
    const oldAfterChange = await authed(changeTok, "GET", "/auth/me");
    const newAfterChange = await authed(brandNew, "GET", "/auth/me");
    check(
      "cambiar la propia clave corta el pase anterior",
      oldAfterChange.status === 401 && oldAfterChange.json.code === "SESSION_REVOKED",
    );
    check("pase nuevo de change-password vale", newAfterChange.status === 200 && changed.status === 200);

    process.env.ACCESS_CHECK_ENABLED = "false";
    clearAccessCacheForTests();
    const switchTok = signToken({
      userId: tambero.id,
      tenantId: tenantA.id,
      roles: ["TAMBERO"],
      tamboIds: [tamboA.id],
      iat: oldIat,
    });
    await prisma.membership.update({ where: { id: memTb.id }, data: { status: "REVOKED", sessionsValidAfter: new Date() } });
    const withSwitch = await authed(switchTok, "GET", "/auth/me");
    check(
      "ACCESS_CHECK_ENABLED=false deja pasar pase de baja",
      withSwitch.status === 200,
      String(withSwitch.status),
    );
    process.env.ACCESS_CHECK_ENABLED = "true";
    clearAccessCacheForTests();

    const unmarked = await prisma.user.create({
      data: { email: `madmin-old-${suffix}@demo.local`, name: "Pre migración", passwordHash: memberHash },
    });
    await prisma.membership.create({
      data: {
        tenantId: tenantA.id,
        userId: unmarked.id,
        roles: ["TAMBERO"],
        status: "ACTIVE",
        tambos: { create: { tenantId: tenantA.id, tamboId: tamboA.id } },
      },
    });
    const preTok = signToken({
      userId: unmarked.id,
      tenantId: tenantA.id,
      roles: ["TAMBERO"],
      tamboIds: [tamboA.id],
      noTimestamp: true,
    });
    const preMe = await authed(preTok, "GET", "/auth/me");
    check("pase sin marcas (pre-migración) sigue valiendo", preMe.status === 200, String(preMe.status));

    const simulatedDbError = new Error("simulated-db-down");
    const origFindUnique = prisma.membership.findUnique.bind(prisma.membership);
    const origConsoleError = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    type FindUnique = typeof prisma.membership.findUnique;
    const membershipDelegate = prisma.membership as { findUnique: FindUnique };
    try {
      membershipDelegate.findUnique = (async () => {
        throw simulatedDbError;
      }) as unknown as FindUnique;
      clearAccessCacheForTests();
      const dbFail = await authed(tokenA, "GET", "/auth/me");
      const loggedCause = logged.some(
        (args) =>
          args[0] === "[access-session] no se pudo leer el acceso" && args[1] === simulatedDbError,
      );
      check(
        "consulta de acceso fallida → 503",
        dbFail.status === 503 &&
          dbFail.json.error === "No se pudo comprobar el acceso. Probá de nuevo.",
        String(dbFail.status),
      );
      check("causa de la consulta queda registrada", loggedCause);
    } finally {
      membershipDelegate.findUnique = origFindUnique as unknown as FindUnique;
      console.error = origConsoleError;
    }
  } finally {
    server.close();
    const tenantIds = [tenantA.id, tenantB.id];
    await prisma.animal.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const mems = await prisma.membership.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { userId: true },
    });
    const userIds = [...new Set(mems.map((m) => m.userId))];
    await prisma.membershipTambo.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tambo.deleteMany({ where: { id: { in: [tamboA.id, tamboA2.id, tamboB.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    if (failed > 0) {
      console.log(`FALLÓ (${failed})`);
      process.exit(1);
    }
    console.log("OK");
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  });
