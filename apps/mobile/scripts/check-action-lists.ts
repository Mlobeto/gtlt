import type { LocalAnimal, LocalHealthEvent, LocalReproEvent } from "../src/db";
import { buildActionLists } from "../src/animals/actionLists";

const now = new Date("2026-10-03T15:00:00Z");

function addDays(days: number) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function animal(id: string, earTag: string, status: string): LocalAnimal {
  return {
    id, tambo_id: "t1", ear_tag: earTag, status, birth_date: null, entered_at: null,
    photo_url: null, photo_local_uri: null, notes: null, breed: null, mother_id: null,
    sire_id: null, version: 1, pending: 0,
  };
}

function service(animalId: string, daysAgo: number, expectedCalvingAt: string | null = null): LocalReproEvent {
  return {
    id: `r-${animalId}`, tambo_id: "t1", animal_id: animalId, type: "SERVICE",
    event_at: addDays(-daysAgo), expected_calving_at: expectedCalvingAt, notes: null, pending: 0,
  };
}

const animals = [
  animal("a1", "101", "DRY"), // parto en 10 días
  animal("a2", "102", "DRY"), // parto atrasado 5 días
  animal("a3", "103", "ACTIVE"), // parto en 40 días → para secar
  animal("a4", "104", "ACTIVE"), // servicio hace 45 días → tacto
  animal("a5", "105", "ACTIVE"), // retiro que sale hoy
  animal("a6", "106", "ACTIVE"), // sin eventos
];

const repros: LocalReproEvent[] = [
  service("a1", 270, addDays(10)),
  service("a2", 285, addDays(-5)),
  service("a3", 240, addDays(40)),
  service("a4", 45),
];

const withdrawals: LocalHealthEvent[] = [
  {
    id: "h1", tambo_id: "t1", animal_id: "a5", type: "TREATMENT", event_at: addDays(-3),
    product_name: "Antibiótico", milk_withdrawal_until: `${addDays(0)}T23:00:00.000Z`,
    notes: null, pending: 0,
  },
];

const lists = buildActionLists({ animals, repros, withdrawals, now });
for (const [name, items] of Object.entries(lists)) {
  console.log(`\n${name} (${items.length})`);
  for (const i of items) {
    console.log(`  Caravana ${i.earTag} · ${i.detail} · daysDelta=${i.daysDelta} · ${i.severity}`);
  }
}

const listed = new Set(Object.values(lists).flat().map((i) => i.earTag));
console.log(`\nCaravana 106 (sin eventos) aparece: ${listed.has("106") ? "SÍ (error)" : "no"}`);
