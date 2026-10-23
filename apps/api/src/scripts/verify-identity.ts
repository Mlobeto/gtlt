import { normalizeEmail, normalizePhone, parseIdentifier } from "../lib/identity.js";

let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`OK  ${name}${detail ? ` · ${detail}` : ""}`);
  else {
    failed += 1;
    console.log(`FALLÓ  ${name}${detail ? ` · ${detail}` : ""}`);
  }
}

function expectPhone(raw: string, expected: string) {
  const r = normalizePhone(raw);
  check(
    `tel ${JSON.stringify(raw)}`,
    r.ok && r.value === expected,
    r.ok ? r.value : r.reason,
  );
}

function expectPhoneFail(raw: string) {
  const r = normalizePhone(raw);
  check(`tel rechazado ${JSON.stringify(raw)}`, !r.ok, r.ok ? r.value : "ok");
}

expectPhone("351 6123456", "+5493516123456");
expectPhone("0351 15 6123456", "+5493516123456");
expectPhone("+54 9 351 612-3456", "+5493516123456");
expectPhone("5493516123456", "+5493516123456");
expectPhone("0054 9 351 6123456", "+5493516123456");
expectPhone("11 4567 8901", "+5491145678901");
expectPhone("011 15 4567 8901", "+5491145678901");
expectPhone("+1 305 555 0100", "+13055550100");
expectPhone("+5493516123456", "+5493516123456");
expectPhone("(351) 612-3456", "+5493516123456");
expectPhone("54 9 11 4567 8901", "+5491145678901");

expectPhoneFail("12345");
expectPhoneFail("351 612345");
expectPhoneFail("");
expectPhoneFail("   ");
expectPhoneFail("abc");
expectPhoneFail("351 15 15 123456");
expectPhoneFail("111515123456");

{
  const r = normalizeEmail("  Demo2@Demo.COM ");
  check("correo recortado y minúsculas", r.ok && r.value === "demo2@demo.com", r.ok ? r.value : r.reason);
}
{
  const r = normalizeEmail("a b@c.com");
  check("correo con espacios internos rechazado", !r.ok);
}
{
  const r = parseIdentifier("351 6123456");
  check(
    "sin @ es teléfono",
    r.ok && r.kind === "phone" && r.value === "+5493516123456",
    r.ok ? `${r.kind}:${r.value}` : r.reason,
  );
}
{
  const r = parseIdentifier("  Demo2@Demo.COM ");
  check(
    "con @ es correo",
    r.ok && r.kind === "email" && r.value === "demo2@demo.com",
    r.ok ? `${r.kind}:${r.value}` : r.reason,
  );
}
{
  const r = parseIdentifier("");
  check("identificador vacío rechazado", !r.ok);
}

if (failed > 0) {
  console.log(`FALLÓ (${failed})`);
  process.exit(1);
}
console.log("OK");
