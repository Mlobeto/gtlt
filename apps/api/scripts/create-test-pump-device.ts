import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const LABEL = "Sensor de prueba (bomba)";

async function main() {
  const tamboId = process.argv[2];
  if (!tamboId) {
    throw new Error("Uso: npx tsx scripts/create-test-pump-device.ts <tamboId>");
  }

  const prisma = new PrismaClient();
  try {
    const tambo = await prisma.tambo.findUnique({ where: { id: tamboId } });
    if (!tambo) throw new Error(`No existe el tambo ${tamboId}`);

    const existing = await prisma.device.findFirst({
      where: { tamboId, kind: "VACUUM_PUMP_SENSOR", label: LABEL },
    });
    const device =
      existing ??
      (await prisma.device.create({
        data: {
          tenantId: tambo.tenantId,
          tamboId,
          kind: "VACUUM_PUMP_SENSOR",
          label: LABEL,
          deviceToken: `test-pump-${randomBytes(16).toString("hex")}`,
        },
      }));

    console.log(`Tambo: ${tambo.name}`);
    console.log(`Device: ${device.id} (${existing ? "ya existía" : "creado"})`);
    console.log(`X-Device-Token: ${device.deviceToken}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
