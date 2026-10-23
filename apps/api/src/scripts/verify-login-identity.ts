import bcrypt from "bcryptjs";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";

const GENERIC = "Invalid credentials";
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`OK  ${name}${detail ? ` · ${detail}` : ""}`);
  else {
    failed += 1;
    console.log(`FALLÓ  ${name}${detail ? ` · ${detail}` : ""}`);
  }
}

async function main() {
  const app = createApp();
  const server = app.listen(0);
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("No se pudo abrir el servidor de prueba");
  const base = `http://127.0.0.1:${addr.port}`;

  const suffix = Date.now().toString(36);
  const email = `identity-login-${suffix}@demo.local`;
  const phone = "+5493516000001";
  const password = "clave-demo-1";
  const passwordHash = await bcrypt.hash(password, 10);

  const tenant = await prisma.tenant.create({ data: { name: `[TEST] identity ${suffix}` } });
  const user = await prisma.user.create({
    data: {
      email,
      phone,
      name: "Login Test",
      passwordHash,
      mustChangePassword: false,
    },
  });
  await prisma.membership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      roles: ["TAMBERO"],
      status: "ACTIVE",
    },
  });

  const login = async (body: unknown) => {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  };

  try {
    const upper = await login({ identifier: email.toUpperCase(), password });
    check("correo en mayúsculas", upper.status === 200 && typeof upper.json.accessToken === "string");

    const p1 = await login({ identifier: "351 6000001", password });
    check("teléfono 351 6000001", p1.status === 200);

    const p2 = await login({ identifier: "0351 15 6000001", password });
    check("teléfono 0351 15 6000001", p2.status === 200);

    const p3 = await login({ identifier: "+54 9 351 600-0001", password });
    check("teléfono +54 9 351 600-0001", p3.status === 200);

    const legacy = await login({ email, password });
    check("cliente viejo con email", legacy.status === 200);

    const ghost = await login({ identifier: "nobody-identity@demo.local", password: "x" });
    check("inexistente es 401 genérico", ghost.status === 401 && ghost.json.error === GENERIC);

    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
    let lastFail = { status: 0, json: {} as Record<string, unknown> };
    for (let i = 0; i < 10; i += 1) {
      lastFail = await login({ identifier: email, password: "mala-clave" });
    }
    check("diez fallos siguen 401", lastFail.status === 401 && lastFail.json.error === GENERIC);
    const locked = await login({ identifier: email, password });
    check(
      "el undécimo es 429 LOGIN_LOCKED",
      locked.status === 429 &&
        locked.json.code === "LOGIN_LOCKED" &&
        typeof locked.json.retryAfterSeconds === "number",
      String(locked.status),
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 3, lockedUntil: null },
    });
    const reset = await login({ identifier: email, password });
    check("ingreso correcto reinicia", reset.status === 200);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    check("contador en cero", after?.failedLogins === 0 && after.lockedUntil == null);

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 10, lockedUntil: new Date(Date.now() - 1000) },
    });
    const expired = await login({ identifier: email, password });
    check("bloqueo vencido deja entrar", expired.status === 200);
  } finally {
    server.close();
    await prisma.membership.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => undefined);
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
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
