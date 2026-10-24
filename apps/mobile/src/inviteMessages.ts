/**
 * Copia de `apps/web/src/lib/inviteMessages.ts`.
 * Si cambiás una función, cambiá la otra.
 */

import { APP_DOWNLOAD_URL, WEB_URL } from "./config";

export { APP_DOWNLOAD_URL, WEB_URL };

function roleLabel(role: string): string {
  if (role === "VETERINARIO") return "veterinario";
  if (role === "TECNICO") return "técnico";
  return "tambero";
}

export function buildInviteMessages(input: {
  inviterName: string;
  tamboName: string;
  role: string;
  token: string;
  webUrl: string;
}): { intro: string; code: string } {
  const webUrl = input.webUrl.replace(/\/$/, "");
  const first =
    input.role === "TECNICO"
      ? `Hola, ${input.inviterName} te invitó a CAL para atender los pedidos de service de ${input.tamboName}.`
      : `Hola, ${input.inviterName} te invitó a CAL para trabajar en ${input.tamboName}.`;
  const lines = [first, ""];
  if (webUrl) {
    lines.push("Para activar tu cuenta, abrí este enlace:");
    lines.push(`${webUrl}/#invitacion=${input.token}`);
    lines.push("");
  }
  lines.push(
    "También podés hacerlo desde la app: tocá «Tengo un código de invitación» y pegá el código que te mando en el mensaje siguiente.",
  );
  lines.push("");
  lines.push("El código vence en 7 días.");
  return { intro: lines.join("\n"), code: input.token };
}

export function buildCredentialsMessage(input: {
  inviterName: string;
  tamboName: string;
  role: string;
  userName: string;
  identifier: string;
  temporaryPassword: string;
  webUrl: string;
  downloadUrl?: string;
}): string {
  const downloadUrl = (input.downloadUrl ?? APP_DOWNLOAD_URL).trim();
  const webUrl = input.webUrl.replace(/\/$/, "");
  const lines = [
    `Hola ${input.userName}, ${input.inviterName} te sumó a ${input.tamboName} en CAL como ${roleLabel(input.role)}.`,
    `Para entrar: usuario ${input.identifier}, clave temporal ${input.temporaryPassword}.`,
    "La primera vez te va a pedir que elijas tu propia clave.",
  ];
  if (downloadUrl) {
    lines.push(`Descargá la app: ${downloadUrl}`);
  } else if (webUrl) {
    lines.push(`Entrá por la web: ${webUrl}`);
  }
  return lines.join("\n");
}
