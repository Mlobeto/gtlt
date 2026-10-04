export type TamboHardware = {
  pumpSensor: boolean;
  flowMeters: boolean;
  rfidReaders: boolean;
};

export type EquipmentLine = {
  kind: "VACUUM_PUMP_SENSOR" | "FLOW_METER" | "RFID_READER";
  label: string;
  quantity: number;
};

export function parseHardware(value: unknown): TamboHardware | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const pumpSensor = raw.pumpSensor;
  const flowMeters = raw.flowMeters;
  const rfidReaders = raw.rfidReaders;
  if (
    typeof pumpSensor !== "boolean" ||
    typeof flowMeters !== "boolean" ||
    typeof rfidReaders !== "boolean"
  ) {
    return null;
  }
  return { pumpSensor, flowMeters, rfidReaders };
}

export function hasHardware(hardware: TamboHardware): boolean {
  return hardware.pumpSensor || hardware.flowMeters || hardware.rfidReaders;
}

/** Cantidades de equipos a partir de bajadas e indicadores. Sin precios. */
export function calculateEquipmentList(
  bajadaCount: number,
  hardware: TamboHardware,
): EquipmentLine[] {
  const items: EquipmentLine[] = [];
  if (hardware.pumpSensor) {
    items.push({
      kind: "VACUUM_PUMP_SENSOR",
      label: "Sensor de bomba de vacío",
      quantity: 1,
    });
  }
  if (hardware.flowMeters) {
    items.push({
      kind: "FLOW_METER",
      label: "Caudalímetro",
      quantity: bajadaCount,
    });
  }
  if (hardware.rfidReaders) {
    items.push({
      kind: "RFID_READER",
      label: "Lector de caravanas",
      quantity: bajadaCount,
    });
  }
  return items;
}
