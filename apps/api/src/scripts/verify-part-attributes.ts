import { validatePartAttributes, type PartFieldDef } from "../lib/part-attributes.js";

const fields: PartFieldDef[] = [
  { key: "model", label: "Modelo", kind: "TEXT", options: [], required: true },
  {
    key: "nominal_flow_lpm",
    label: "Caudal nominal",
    kind: "NUMBER",
    options: [],
    required: true,
    unit: "L/min",
  },
  {
    key: "motor_phase",
    label: "Motor",
    kind: "SELECT",
    options: ["Monofásico", "Trifásico"],
    required: true,
  },
  {
    key: "sealed",
    label: "Sellada",
    kind: "BOOLEAN",
    options: [],
    required: true,
  },
  {
    key: "motor_power_hp",
    label: "Potencia del motor",
    kind: "NUMBER",
    options: [],
    required: false,
    unit: "HP",
    min: 1,
    max: 20,
  },
];

type Case = {
  name: string;
  input: unknown;
  expectOk: boolean;
  expectError?: string;
};

const cases: Case[] = [
  {
    name: "válido completo",
    input: {
      model: "ABC-300",
      nominal_flow_lpm: 1500,
      motor_phase: "Trifásico",
      sealed: true,
      motor_power_hp: "5,5",
    },
    expectOk: true,
  },
  {
    name: "TEXT vacío obligatorio",
    input: { model: "", nominal_flow_lpm: 10, motor_phase: "Monofásico", sealed: false },
    expectOk: false,
    expectError: "Completá: Modelo",
  },
  {
    name: "TEXT demasiado largo",
    input: {
      model: "x".repeat(201),
      nominal_flow_lpm: 10,
      motor_phase: "Monofásico",
      sealed: false,
    },
    expectOk: false,
    expectError: "Modelo no puede superar 200 caracteres",
  },
  {
    name: "NUMBER no numérico",
    input: { model: "A", nominal_flow_lpm: "hola", motor_phase: "Monofásico", sealed: false },
    expectOk: false,
    expectError: "Caudal nominal debe ser un número",
  },
  {
    name: "NUMBER negativo",
    input: { model: "A", nominal_flow_lpm: -3, motor_phase: "Monofásico", sealed: false },
    expectOk: false,
    expectError: "Caudal nominal debe ser un número positivo",
  },
  {
    name: "NUMBER fuera de max",
    input: {
      model: "A",
      nominal_flow_lpm: 10,
      motor_phase: "Monofásico",
      sealed: false,
      motor_power_hp: 50,
    },
    expectOk: false,
    expectError: "Potencia del motor no puede ser mayor que 20",
  },
  {
    name: "SELECT inválido",
    input: { model: "A", nominal_flow_lpm: 10, motor_phase: "Bifásico", sealed: false },
    expectOk: false,
    expectError: "Motor: elegí una de las opciones",
  },
  {
    name: "BOOLEAN inválido",
    input: { model: "A", nominal_flow_lpm: 10, motor_phase: "Monofásico", sealed: "sí" },
    expectOk: false,
    expectError: "Sellada: elegí sí o no",
  },
  {
    name: "clave desconocida",
    input: {
      model: "A",
      nominal_flow_lpm: 10,
      motor_phase: "Monofásico",
      sealed: true,
      extra: 1,
    },
    expectOk: false,
    expectError: "Campo desconocido: extra",
  },
  {
    name: "campo inactivo",
    input: { model: "A", nominal_flow_lpm: 10, motor_phase: "Monofásico", sealed: true, old: "x" },
    expectOk: false,
    expectError: "Campo desconocido: old",
  },
];

const inactiveFields: PartFieldDef[] = [
  ...fields,
  { key: "old", label: "Viejo", kind: "TEXT", options: [], required: false, active: false },
];

let failed = 0;
for (const c of cases) {
  const used = c.name === "campo inactivo" ? inactiveFields : fields;
  const result = validatePartAttributes(used, c.input);
  const ok = result.ok === c.expectOk && (!c.expectError || (!result.ok && result.errors.includes(c.expectError)));
  const detail = result.ok ? JSON.stringify(result.value) : result.errors.join(" | ");
  console.log(`${ok ? "OK" : "FAIL"}  ${c.name}  →  ${detail}`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} caso(s) fallaron`);
  process.exit(1);
}
console.log("\nverify-part-attributes: todos los casos OK");
