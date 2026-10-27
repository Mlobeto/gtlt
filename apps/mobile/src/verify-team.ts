import { ApiError, createHttp } from "./http";
import { createTeamApi, teamErrorMessage } from "./team";
import { formatPhoneDisplay } from "./format";
import { WEB_URL } from "./config";

let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`OK  ${name}${detail ? ` · ${detail}` : ""}`);
  else {
    failed += 1;
    console.log(`FALLÓ  ${name}${detail ? ` · ${detail}` : ""}`);
  }
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Captured = { method: string; url: string; body: string };

function captureHttp(reply: (captured: Captured) => Response) {
  let last: Captured = { method: "", url: "", body: "" };
  const http = createHttp({
    fetch: async (input, init) => {
      last = {
        method: String(init?.method ?? "GET").toUpperCase(),
        url: String(input),
        body: String(init?.body ?? ""),
      };
      return reply(last);
    },
    baseUrl: "http://x",
  });
  return { http, last: () => last, api: createTeamApi(http.request) };
}

async function withConsoleSpy<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const original = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };
  const spy = (...args: unknown[]) => {
    logs.push(args.map((item) => String(item)).join(" "));
  };
  console.log = spy;
  console.error = spy;
  console.warn = spy;
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.log = original.log;
    console.error = original.error;
    console.warn = original.warn;
  }
}

async function main() {
  {
    const { last, api } = captureHttp(() => jsonResponse(200, { items: [] }));
    await api.listTeam("tok", "tambo-1", true);
    check(
      "GET /memberships lista",
      last().method === "GET"
        && last().url === "http://x/memberships?tamboId=tambo-1&includeRevoked=true"
        && last().body === "",
      `${last().method} ${last().url}`,
    );
  }

  {
    const { last, api } = captureHttp(() =>
      jsonResponse(201, { item: { id: "m1" }, temporaryPassword: "tmp-secret" }),
    );
    const { result, logs } = await withConsoleSpy(() =>
      api.createMember("tok", {
        tamboId: "tambo-1",
        name: " Ana ",
        phone: " 351 6123456 ",
        email: "  ",
        role: "TAMBERO",
      }),
    );
    const body = JSON.parse(last().body || "{}") as Record<string, unknown>;
    check(
      "POST /memberships/create-member",
      last().method === "POST" && last().url === "http://x/memberships/create-member",
      last().url,
    );
    check(
      "createMember omite vacíos y recorta teléfono",
      body.tamboId === "tambo-1"
        && body.name === "Ana"
        && body.role === "TAMBERO"
        && body.phone === "351 6123456"
        && !("email" in body),
      JSON.stringify(body),
    );
    check(
      "temporaryPassword de alta no se escribe en console",
      !logs.some((line) => line.includes("tmp-secret")) && result.temporaryPassword === "tmp-secret",
      logs.join(" | "),
    );
  }

  {
    const { last, api } = captureHttp(() => jsonResponse(200, { item: { id: "m1" } }));
    await api.updateMember("tok", "m1", { role: "VETERINARIO", tamboIds: ["a", "b"] });
    check(
      "PATCH /memberships/:id",
      last().method === "PATCH"
        && last().url === "http://x/memberships/m1"
        && last().body === JSON.stringify({ role: "VETERINARIO", tamboIds: ["a", "b"] }),
      `${last().method} ${last().url} ${last().body}`,
    );
  }

  {
    const { last, api } = captureHttp(() => jsonResponse(200, { temporaryPassword: "reset-secret" }));
    const { logs } = await withConsoleSpy(() => api.resetMemberPassword("tok", "m1"));
    check(
      "POST /memberships/:id/reset-password",
      last().method === "POST" && last().url === "http://x/memberships/m1/reset-password" && last().body === "",
      `${last().method} ${last().url}`,
    );
    check(
      "temporaryPassword de restablecer no se escribe en console",
      !logs.some((line) => line.includes("reset-secret")),
      logs.join(" | "),
    );
  }

  {
    const { last, api } = captureHttp(() => jsonResponse(200, { item: { id: "m1" } }));
    await api.revokeMember("tok", "m1");
    check(
      "POST /memberships/:id/revoke",
      last().method === "POST" && last().url === "http://x/memberships/m1/revoke",
      last().url,
    );
  }

  {
    const { last, api } = captureHttp(() => jsonResponse(200, { item: { id: "m1" } }));
    await api.reactivateMember("tok", "m1");
    check(
      "POST /memberships/:id/reactivate",
      last().method === "POST" && last().url === "http://x/memberships/m1/reactivate",
      last().url,
    );
  }

  {
    const { last, api } = captureHttp(() => new Response(null, { status: 204 }));
    await api.cancelInvite("tok", "m1");
    check(
      "POST /memberships/:id/cancel-invite",
      last().method === "POST" && last().url === "http://x/memberships/m1/cancel-invite",
      last().url,
    );
  }

  {
    const { last, api } = captureHttp(() => jsonResponse(201, { item: { id: "m1" }, inviteToken: "inv-1" }));
    await api.inviteMember("tok", {
      tamboId: "tambo-1",
      name: "Luis",
      email: "  LUIS@Mail.com ",
      role: "VETERINARIO",
    });
    const body = JSON.parse(last().body || "{}") as Record<string, unknown>;
    check(
      "POST /memberships/invite",
      last().method === "POST"
        && last().url === "http://x/memberships/invite"
        && body.email === "luis@mail.com"
        && body.role === "VETERINARIO"
        && !("phone" in body),
      JSON.stringify(body),
    );
  }

  {
    const err = new ApiError("x", 409, "USER_EXISTS");
    check(
      "USER_EXISTS mensaje",
      teamErrorMessage(err) === "Esa persona ya tiene una cuenta en CAL. Invitala con un enlace para sumarla a este tambo.",
    );
  }
  {
    const err = new ApiError("x", 409, "SHARED_ACCOUNT");
    check(
      "SHARED_ACCOUNT mensaje",
      teamErrorMessage(err) === "Esa persona también trabaja con otra cuenta: no se puede cambiar eso desde acá.",
    );
  }
  {
    const err = new ApiError("x", 409, "IDENTITY_TAKEN");
    check(
      "IDENTITY_TAKEN mensaje",
      teamErrorMessage(err) === "Ese teléfono (o correo) ya lo usa otra persona.",
    );
  }
  {
    const err = new ApiError("Esa persona no llegó a crear su clave: creá una invitación nueva.", 409);
    check(
      "409 reactivar sin clave",
      teamErrorMessage(err) === "Esa persona no llegó a crear su clave: creá un acceso nuevo.",
    );
  }
  {
    const err = new ApiError("rate", 429);
    check("429 mensaje general", teamErrorMessage(err) === "Demasiados intentos. Probá de nuevo más tarde.");
  }
  check(
    "error de red mensaje general",
    teamErrorMessage(new Error("Failed to fetch")) === "No hay señal. Probá de nuevo cuando vuelva la conexión.",
  );

  {
    let handlerCalls = 0;
    const { http, api } = captureHttp(() => jsonResponse(409, { error: "existe", code: "USER_EXISTS" }));
    http.setSessionRevokedHandler(() => {
      handlerCalls += 1;
    });
    await api.createMember("tok", { tamboId: "tambo-1", name: "Ana", phone: "351", role: "TAMBERO" }).catch(() => undefined);
    check("409 no dispara sesión revocada", handlerCalls === 0, String(handlerCalls));
  }

  {
    let handlerCalls = 0;
    let calls = 0;
    const http = createHttp({
      fetch: async () => {
        calls += 1;
        return jsonResponse(401, {
          error: "Tu acceso fue modificado. Volvé a ingresar.",
          code: "SESSION_REVOKED",
        });
      },
      baseUrl: "http://x",
    });
    http.setSessionRevokedHandler(async () => {
      handlerCalls += 1;
    });
    const api = createTeamApi(http.request);
    await api.listTeam("tok", "tambo-1").catch(() => undefined);
    await api.listTeam("tok", "tambo-1").catch(() => undefined);
    check("SESSION_REVOKED dispara una sola vez", handlerCalls === 1, String(handlerCalls));
    check("SESSION_REVOKED no vuelve a pedir", calls === 1, String(calls));
  }

  check("teléfono Córdoba", formatPhoneDisplay("+5493516123456") === "351 612-3456", formatPhoneDisplay("+5493516123456"));
  check("teléfono 11", formatPhoneDisplay("+5491145678901") === "11 4567-8901", formatPhoneDisplay("+5491145678901"));
  check("teléfono internacional", formatPhoneDisplay("+15551234567") === "+15551234567");
  check("teléfono vacío", formatPhoneDisplay("") === "");
  check("teléfono inválido", formatPhoneDisplay("hola") === "");
  check(
    "WEB_URL por defecto",
    process.env.EXPO_PUBLIC_WEB_URL
      ? WEB_URL.length > 0
      : WEB_URL === "https://gtlt.vercel.app",
    WEB_URL,
  );

  if (failed > 0) {
    console.log(`FALLÓ (${failed})`);
    process.exit(1);
  }
  console.log("OK");
}

void main();
