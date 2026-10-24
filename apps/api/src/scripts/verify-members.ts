import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { createInvite } from "../lib/invites.js";
import { decideDirectCreate, decideResetPassword, displayIdentifier } from "../lib/members.js";

let failed = 0;

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

type CredentialsBuilder = (input: {
  inviterName: string;
  tamboName: string;
  role: string;
  userName: string;
  identifier: string;
  temporaryPassword: string;
  webUrl: string;
  downloadUrl?: string;
}) => string;

async function loadCredentialsBuilder(relativeFromScript: string): Promise<CredentialsBuilder> {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), relativeFromScript);
  const mod = (await import(pathToFileURL(file).href)) as { buildCredentialsMessage: CredentialsBuilder };
  return mod.buildCredentialsMessage;
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
  const tamberoHash = await bcrypt.hash("clave-tambero-1", 10);

  const tenantA = await prisma.tenant.create({ data: { name: `[TEST] members A ${suffix}` } });
  const tenantB = await prisma.tenant.create({ data: { name: `[TEST] members B ${suffix}` } });
  const tamboA = await prisma.tambo.create({
    data: { tenantId: tenantA.id, name: `[TEST] tambo A ${suffix}`, bajadaCount: 8, activatedAt: new Date() },
  });
  const tamboB = await prisma.tambo.create({
    data: { tenantId: tenantB.id, name: `[TEST] tambo B ${suffix}`, bajadaCount: 8, activatedAt: new Date() },
  });

  const ownerA = await prisma.user.create({
    data: { email: `members-owner-a-${suffix}@demo.local`, name: "Dueño A", passwordHash: ownerHash },
  });
  const ownerB = await prisma.user.create({
    data: { email: `members-owner-b-${suffix}@demo.local`, name: "Dueño B", passwordHash: ownerHash },
  });
  const memOwnerA = await prisma.membership.create({
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
    return { status: res.status, json: await jsonOf(res) };
  };

  try {
    check("decisión alta nueva", decideDirectCreate(null, tenantA.id).action === "create");
    const withPass = decideDirectCreate(
      { passwordHash: "x", memberships: [{ tenantId: tenantA.id, status: "ACTIVE" }] },
      tenantA.id,
    );
    check("decisión alta con clave", withPass.action === "reject_exists" && withPass.code === "USER_EXISTS");
    const otherActive = decideDirectCreate(
      { passwordHash: null, memberships: [{ tenantId: tenantB.id, status: "ACTIVE" }] },
      tenantA.id,
    );
    check("decisión stub activo otro tenant", otherActive.action === "reject_other_tenant");
    const pendingSame = decideDirectCreate(
      { passwordHash: null, memberships: [{ tenantId: tenantA.id, status: "PENDING" }] },
      tenantA.id,
    );
    check("decisión stub pendiente mismo tenant", pendingSame.action === "activate_stub");
    const asTambero = decideResetPassword({
      callerRoles: ["TAMBERO"],
      callerTenantId: tenantA.id,
      membership: {
        tenantId: tenantA.id,
        status: "ACTIVE",
        roles: ["TAMBERO"],
        user: { passwordHash: "x", memberships: [{ tenantId: tenantA.id }] },
      },
    });
    check("decisión restablecer como tambero", asTambero.action === "reject" && asTambero.status === 403);

    const loginA = await login({ identifier: ownerA.email, password: ownerPass, tenantId: tenantA.id });
    const tokenA = String(loginA.json.accessToken ?? "");
    check("login dueño A", loginA.status === 200 && tokenA.length > 10);
    const loginB = await login({ identifier: ownerB.email, password: ownerPass, tenantId: tenantB.id });
    const tokenB = String(loginB.json.accessToken ?? "");
    check("login dueño B", loginB.status === 200 && tokenB.length > 10);

    const typedPhone = `351 ${n.slice(0, 3)} ${n.slice(3)}`;
    const created = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "Tambero Nuevo",
      phone: typedPhone,
      role: "TAMBERO",
    });
    const item = created.json.item as
      | { id?: string; status?: string; roles?: string[]; user?: { id?: string } }
      | undefined;
    const temp1 = String(created.json.temporaryPassword ?? "");
    check(
      "1. alta teléfono nuevo",
      created.status === 201 &&
        item?.status === "ACTIVE" &&
        Boolean(item.roles?.includes("TAMBERO")) &&
        Boolean(item.user?.id) &&
        temp1.length >= 8,
      String(created.status),
    );
    const createdUser = item?.user?.id
      ? await prisma.user.findUnique({ where: { id: item.user.id } })
      : null;
    check("1. mustChangePassword", createdUser?.mustChangePassword === true);

    const digits = typedPhone.replace(/\D/g, "");
    const altPhone = `0${digits.slice(0, 3)} 15 ${digits.slice(3)}`;
    const in1 = await login({ identifier: typedPhone, password: temp1, tenantId: tenantA.id });
    const inAlt = await login({ identifier: altPhone, password: temp1, tenantId: tenantA.id });
    check("1. ingreso con teléfono escrito", in1.status === 200);
    check("1. ingreso con otro formato", inAlt.status === 200, String(inAlt.status));

    const existingEmail = `members-exist-${suffix}@demo.local`;
    const existUser = await prisma.user.create({
      data: { email: existingEmail, name: "Ya tiene clave", passwordHash: tamberoHash },
    });
    const existMem = await prisma.membership.create({
      data: { tenantId: tenantA.id, userId: existUser.id, roles: ["TAMBERO"], status: "ACTIVE" },
    });
    const existBefore = await prisma.user.findUnique({ where: { id: existUser.id } });
    const exist2 = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "No debería cambiar",
      email: existingEmail,
      role: "TAMBERO",
    });
    const existAfter = await prisma.user.findUnique({ where: { id: existUser.id } });
    const existMemAfter = await prisma.membership.findMany({ where: { userId: existUser.id } });
    check(
      "2. alta correo con clave → 409 USER_EXISTS",
      exist2.status === 409 && exist2.json.code === "USER_EXISTS",
      String(exist2.status),
    );
    check(
      "2. cuenta intacta",
      existAfter?.passwordHash === existBefore?.passwordHash &&
        existAfter?.name === existBefore?.name &&
        existMemAfter.length === 1 &&
        existMemAfter[0]?.id === existMem.id,
    );

    const stubPhone = `351 ${String((Number(n) + 1) % 10_000_000).padStart(7, "0")}`;
    const invite = await createInvite({
      tenantId: tenantA.id,
      tamboId: tamboA.id,
      phone: stubPhone,
      name: "Invitado stub",
      role: "TAMBERO",
    });
    const oldToken = invite.inviteToken;
    check("3. invitación pendiente creada", Boolean(oldToken) && invite.item.status === "PENDING");
    const activated = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "Invitado ahora activo",
      phone: stubPhone,
      role: "TAMBERO",
    });
    const tempStub = String(activated.json.temporaryPassword ?? "");
    const actItem = activated.json.item as { status?: string } | undefined;
    check(
      "3. alta stub mismo tenant",
      activated.status === 201 && actItem?.status === "ACTIVE" && tempStub.length >= 8,
      String(activated.status),
    );
    const reuse = await fetch(`${base}/memberships/accept-invite/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: oldToken, password: "nueva-clave-9" }),
    });
    check("3. código de invitación ya no sirve", reuse.status === 404 || reuse.status === 410, String(reuse.status));

    const otherStubPhone = `351 ${String((Number(n) + 2) % 10_000_000).padStart(7, "0")}`;
    const otherStub = await prisma.user.create({
      data: { phone: `+549${otherStubPhone.replace(/\D/g, "")}`, name: "Stub otro tenant" },
    });
    await prisma.membership.create({
      data: { tenantId: tenantB.id, userId: otherStub.id, roles: ["TAMBERO"], status: "ACTIVE" },
    });
    const otherStubCreate = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "No debe entrar",
      phone: otherStubPhone,
      role: "TAMBERO",
    });
    check("4. stub activo en otro tenant → 409", otherStubCreate.status === 409, String(otherStubCreate.status));
    const otherStubAfter = await prisma.user.findUnique({ where: { id: otherStub.id } });
    check("4. no se le asignó clave", otherStubAfter?.passwordHash == null);

    const resetPhone = `351 ${String((Number(n) + 3) % 10_000_000).padStart(7, "0")}`;
    const resetCreate = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "Tambero reset",
      phone: resetPhone,
      role: "TAMBERO",
    });
    const resetItem = resetCreate.json.item as { id?: string; user?: { id?: string } } | undefined;
    const oldTemp = String(resetCreate.json.temporaryPassword ?? "");
    if (resetItem?.user?.id) {
      await prisma.user.update({
        where: { id: resetItem.user.id },
        data: { failedLogins: 10, lockedUntil: new Date(Date.now() + 60 * 60 * 1000) },
      });
    }
    const resetOk = await authed(tokenA, "POST", `/memberships/${resetItem?.id}/reset-password`);
    const newTemp = String(resetOk.json.temporaryPassword ?? "");
    check(
      "5. restablecer tambero de este tenant",
      resetOk.status === 200 && newTemp.length >= 8 && newTemp !== oldTemp,
      String(resetOk.status),
    );
    const oldLogin = await login({ identifier: resetPhone, password: oldTemp, tenantId: tenantA.id });
    const newLogin = await login({ identifier: resetPhone, password: newTemp, tenantId: tenantA.id });
    const resetUser = resetItem?.user?.id
      ? await prisma.user.findUnique({ where: { id: resetItem.user.id } })
      : null;
    check("5. clave anterior no entra", oldLogin.status === 401);
    check("5. clave nueva entra", newLogin.status === 200);
    check(
      "5. mustChangePassword y desbloqueo",
      resetUser?.mustChangePassword === true && resetUser.failedLogins === 0 && resetUser.lockedUntil == null,
    );

    const sharedPhone = `351 ${String((Number(n) + 4) % 10_000_000).padStart(7, "0")}`;
    const sharedCreate = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "Tambero compartido",
      phone: sharedPhone,
      role: "TAMBERO",
    });
    const sharedItem = sharedCreate.json.item as { id?: string; user?: { id?: string } } | undefined;
    if (sharedItem?.user?.id) {
      await prisma.membership.create({
        data: { tenantId: tenantB.id, userId: sharedItem.user.id, roles: ["TAMBERO"], status: "ACTIVE" },
      });
    }
    const sharedReset = await authed(tokenA, "POST", `/memberships/${sharedItem?.id}/reset-password`);
    check(
      "6. restablecer cuenta compartida → 409 SHARED_ACCOUNT",
      sharedReset.status === 409 && sharedReset.json.code === "SHARED_ACCOUNT",
      String(sharedReset.status),
    );

    const adminUser = await prisma.user.create({
      data: { email: `members-admin-${suffix}@demo.local`, name: "Admin A", passwordHash: tamberoHash },
    });
    const memAdmin = await prisma.membership.create({
      data: { tenantId: tenantA.id, userId: adminUser.id, roles: ["ADMIN"], status: "ACTIVE" },
    });
    const techUser = await prisma.user.create({
      data: { email: `members-tech-${suffix}@demo.local`, name: "Técnico A", passwordHash: tamberoHash },
    });
    const memTech = await prisma.membership.create({
      data: { tenantId: tenantA.id, userId: techUser.id, roles: ["TECNICO"], status: "ACTIVE" },
    });
    const resetOwner = await authed(tokenA, "POST", `/memberships/${memOwnerA.id}/reset-password`);
    const resetAdmin = await authed(tokenA, "POST", `/memberships/${memAdmin.id}/reset-password`);
    const resetTech = await authed(tokenA, "POST", `/memberships/${memTech.id}/reset-password`);
    check("7. restablecer dueño → 403", resetOwner.status === 403, String(resetOwner.status));
    check("7. restablecer admin → 403", resetAdmin.status === 403, String(resetAdmin.status));
    check("7. restablecer técnico → 403", resetTech.status === 403, String(resetTech.status));

    const tamberoCallerPhone = `351 ${String((Number(n) + 5) % 10_000_000).padStart(7, "0")}`;
    const tamberoCaller = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "Tambero llamador",
      phone: tamberoCallerPhone,
      role: "TAMBERO",
    });
    const tamberoTemp = String(tamberoCaller.json.temporaryPassword ?? "");
    const tamberoLogin = await login({
      identifier: tamberoCallerPhone,
      password: tamberoTemp,
      tenantId: tenantA.id,
    });
    const tokenTambero = String(tamberoLogin.json.accessToken ?? "");
    const resetAsTambero = await authed(tokenTambero, "POST", `/memberships/${resetItem?.id}/reset-password`);
    check("7. restablecer como tambero → 403", resetAsTambero.status === 403, String(resetAsTambero.status));

    const crossCreate = await authed(tokenB, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "Intruso",
      phone: `351 ${String((Number(n) + 6) % 10_000_000).padStart(7, "0")}`,
      role: "TAMBERO",
    });
    check("8. dueño de otro tenant no crea → 404", crossCreate.status === 404, String(crossCreate.status));
    const crossReset = await authed(tokenB, "POST", `/memberships/${resetItem?.id}/reset-password`);
    check("8. dueño de otro tenant no restablece → 404", crossReset.status === 404, String(crossReset.status));

    const badRole = await authed(tokenA, "POST", "/memberships/create-member", {
      tamboId: tamboA.id,
      name: "Dueño falso",
      phone: `351 ${String((Number(n) + 7) % 10_000_000).padStart(7, "0")}`,
      role: "DUENIO",
    });
    check("9. rol DUENIO en alta → 400", badRole.status === 400, String(badRole.status));

    check("identificador como lo escribió el dueño", displayIdentifier({ typedPhone: "351 6123456", phone: "+5493516123456" }) === "351 6123456");
    check("identificador sin +549", displayIdentifier({ phone: "+5493516123456" }) === "3516123456");

    const buildWebCredentials = await loadCredentialsBuilder("../../../web/src/lib/inviteMessages.ts");
    const buildMobileCredentials = await loadCredentialsBuilder("../../../mobile/src/inviteMessages.ts");
    const msgInput = {
      inviterName: "Dueño A",
      tamboName: "La Esperanza",
      role: "TAMBERO",
      userName: "Juan",
      identifier: "351 6123456",
      temporaryPassword: "TempClave12",
      webUrl: "https://cal.example",
      downloadUrl: "",
    };
    const webMsg = buildWebCredentials(msgInput);
    const mobileMsg = buildMobileCredentials(msgInput);
    check("mensaje web tiene identificador", webMsg.includes("351 6123456"));
    check("mensaje web tiene clave", webMsg.includes("TempClave12"));
    check("mensaje mobile tiene identificador y clave", mobileMsg.includes("351 6123456") && mobileMsg.includes("TempClave12"));
    check(
      "sin downloadUrl no queda texto roto",
      !webMsg.includes("undefined") &&
        !webMsg.includes("Descargá la app:") &&
        webMsg.includes("https://cal.example") &&
        !/\n{3,}/.test(webMsg),
    );
    const withDl = buildWebCredentials({ ...msgInput, downloadUrl: "https://descarga.example/app" });
    check("con downloadUrl incluye la app", withDl.includes("https://descarga.example/app"));
  } finally {
    server.close();
    const tenantIds = [tenantA.id, tenantB.id];
    const mems = await prisma.membership.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { userId: true },
    });
    const userIds = [...new Set(mems.map((m) => m.userId))];
    await prisma.membershipTambo.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.tambo.deleteMany({ where: { id: { in: [tamboA.id, tamboB.id] } } });
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
