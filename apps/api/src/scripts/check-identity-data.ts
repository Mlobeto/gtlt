import { prisma } from "../lib/prisma.js";
import { normalizeEmail, normalizePhone } from "../lib/identity.js";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, phone: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const emailMap = new Map<string, string[]>();
  const phoneMap = new Map<string, { id: string; raw: string }[]>();
  const unnormalizable: { id: string; phone: string }[] = [];
  const noIdentity: { id: string; name: string }[] = [];

  for (const u of users) {
    const email = u.email ? normalizeEmail(u.email) : { ok: false as const };
    const phone = u.phone ? normalizePhone(u.phone) : { ok: false as const };

    if (email.ok) {
      const ids = emailMap.get(email.value) ?? [];
      ids.push(u.id);
      emailMap.set(email.value, ids);
    }

    if (u.phone && u.phone.trim()) {
      if (!phone.ok) unnormalizable.push({ id: u.id, phone: u.phone });
      else {
        const ids = phoneMap.get(phone.value) ?? [];
        ids.push({ id: u.id, raw: u.phone });
        phoneMap.set(phone.value, ids);
      }
    }

    const hasEmail = email.ok;
    const hasPhone = phone.ok;
    if (!hasEmail && !hasPhone) noIdentity.push({ id: u.id, name: u.name });
  }

  console.log("Correos que chocan al pasar a minúsculas:");
  let emailClash = 0;
  for (const [email, ids] of emailMap) {
    if (ids.length > 1) {
      emailClash += 1;
      console.log(`  ${email} → ${ids.join(", ")}`);
    }
  }
  if (emailClash === 0) console.log("  (ninguno)");

  console.log("Teléfonos que no se pueden normalizar:");
  if (unnormalizable.length === 0) console.log("  (ninguno)");
  for (const row of unnormalizable) console.log(`  ${row.id} → ${row.phone}`);

  console.log("Teléfonos repetidos (canónicos):");
  let phoneClash = 0;
  for (const [phone, rows] of phoneMap) {
    if (rows.length > 1) {
      phoneClash += 1;
      console.log(`  ${phone} → ${rows.map((r) => `${r.id} (${r.raw})`).join(", ")}`);
    }
  }
  if (phoneClash === 0) console.log("  (ninguno)");

  console.log("Usuarios sin correo ni teléfono canónico:");
  if (noIdentity.length === 0) console.log("  (ninguno)");
  for (const row of noIdentity) console.log(`  ${row.id} · ${row.name}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
