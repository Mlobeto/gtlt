import {
  buildPedigree,
  listOffspring,
  type AncestorNode,
  type PedigreeAnimal,
  type PedigreeSire,
} from "../lib/pedigree.js";

function animal(
  partial: Partial<PedigreeAnimal> & Pick<PedigreeAnimal, "id" | "earTag">,
): PedigreeAnimal {
  return {
    status: "ACTIVE",
    birthDate: null,
    breed: null,
    photoUrl: null,
    tamboId: "t1",
    tamboName: "Tambo 1",
    motherId: null,
    sireId: null,
    deletedAt: null,
    ...partial,
  };
}

function maps(animals: PedigreeAnimal[], sires: PedigreeSire[] = []) {
  return {
    animalsById: new Map(animals.map((a) => [a.id, a])),
    siresById: new Map(sires.map((s) => [s.id, s])),
  };
}

let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`OK  ${name}${detail ? ` · ${detail}` : ""}`);
  else {
    failed += 1;
    console.log(`FALLÓ  ${name}${detail ? ` · ${detail}` : ""}`);
  }
}

function kindOf(n: AncestorNode): string {
  if (n.kind === "ANIMAL") return `ANIMAL:${n.earTag}${n.truncated ? ":trunc" : ""}`;
  if (n.kind === "SIRE") return `SIRE:${n.name}`;
  return "UNKNOWN";
}

const root = animal({ id: "r", earTag: "100" });

{
  const tree = buildPedigree({ rootId: "r", generations: 3, ...maps([root]) });
  check(
    "sin padres cargados",
    tree.mother.kind === "UNKNOWN" && tree.father.kind === "UNKNOWN",
    `${kindOf(tree.mother)}/${kindOf(tree.father)}`,
  );
}

{
  const mother = animal({ id: "m", earTag: "90" });
  const tree = buildPedigree({
    rootId: "r",
    generations: 3,
    ...maps([animal({ ...root, motherId: "m" }), mother]),
  });
  check(
    "solo madre",
    tree.mother.kind === "ANIMAL" &&
      tree.mother.kind === "ANIMAL" &&
      tree.mother.earTag === "90" &&
      tree.father.kind === "UNKNOWN" &&
      tree.mother.mother.kind === "UNKNOWN" &&
      tree.mother.father.kind === "UNKNOWN",
    `${kindOf(tree.mother)}/${kindOf(tree.father)}`,
  );
}

{
  const sire: PedigreeSire = {
    id: "sx",
    name: "Toro Ext",
    registrationCode: "EXT-1",
    isExternal: true,
    linkedAnimalId: null,
  };
  const tree = buildPedigree({
    rootId: "r",
    generations: 3,
    ...maps([animal({ ...root, sireId: "sx" })], [sire]),
  });
  check(
    "padre externo (SIRE)",
    tree.father.kind === "SIRE" &&
      tree.father.name === "Toro Ext" &&
      tree.father.registrationCode === "EXT-1" &&
      tree.father.isExternal === true &&
      tree.mother.kind === "UNKNOWN",
    kindOf(tree.father),
  );
}

{
  const bull = animal({
    id: "bull",
    earTag: "50",
    motherId: "gm",
  });
  const gm = animal({ id: "gm", earTag: "10", birthDate: "2015-01-01" });
  const sire: PedigreeSire = {
    id: "sp",
    name: "Toro Propio",
    registrationCode: "OWN-1",
    isExternal: false,
    linkedAnimalId: "bull",
  };
  const tree = buildPedigree({
    rootId: "r",
    generations: 3,
    ...maps([animal({ ...root, sireId: "sp" }), bull, gm], [sire]),
  });
  check(
    "padre propio con ficha cuyo árbol continúa",
    tree.father.kind === "ANIMAL" &&
      tree.father.earTag === "50" &&
      tree.father.mother.kind === "ANIMAL" &&
      tree.father.mother.earTag === "10",
    kindOf(tree.father),
  );
}

{
  const mother = animal({ id: "m", earTag: "90", motherId: "gm" });
  const gm = animal({ id: "gm", earTag: "10" });
  const tree = buildPedigree({
    rootId: "r",
    generations: 1,
    ...maps([animal({ ...root, motherId: "m" }), mother, gm]),
  });
  check(
    "corte por profundidad con truncated",
    tree.mother.kind === "ANIMAL" &&
      tree.mother.truncated === true &&
      tree.mother.mother.kind === "UNKNOWN" &&
      tree.mother.father.kind === "UNKNOWN",
    kindOf(tree.mother),
  );
}

{
  const mother = animal({ id: "m", earTag: "90", deletedAt: "2026-01-01" });
  const tree = buildPedigree({
    rootId: "r",
    generations: 3,
    ...maps([animal({ ...root, motherId: "m" }), mother]),
  });
  check("ascendiente borrado → UNKNOWN", tree.mother.kind === "UNKNOWN", kindOf(tree.mother));
}

{
  const a = animal({ id: "a", earTag: "1", motherId: "b" });
  const b = animal({ id: "b", earTag: "2", motherId: "a" });
  const tree = buildPedigree({
    rootId: "r",
    generations: 4,
    ...maps([animal({ ...root, motherId: "a" }), a, b]),
  });
  const cycleCut =
    tree.mother.kind === "ANIMAL" &&
    tree.mother.earTag === "1" &&
    tree.mother.mother.kind === "ANIMAL" &&
    tree.mother.mother.earTag === "2" &&
    tree.mother.mother.mother.kind === "UNKNOWN";
  check(
    "ciclo en la línea (R→A→B→A, la raíz queda fuera del bucle)",
    cycleCut,
    JSON.stringify({
      m: kindOf(tree.mother),
      mm: tree.mother.kind === "ANIMAL" ? kindOf(tree.mother.mother) : "",
    }),
  );
}

{
  const a = animal({ id: "a", earTag: "A", motherId: "b" });
  const b = animal({ id: "b", earTag: "B", motherId: "a" });
  const tree = buildPedigree({
    rootId: "a",
    generations: 4,
    ...maps([a, b]),
  });
  const ok =
    tree.mother.kind === "ANIMAL" &&
    tree.mother.id === "b" &&
    tree.mother.mother.kind === "UNKNOWN";
  check(
    "ciclo (1): la raíz es su propio ancestro (A←B←A)",
    ok,
    JSON.stringify({
      mother: kindOf(tree.mother),
      motherOfB: tree.mother.kind === "ANIMAL" ? kindOf(tree.mother.mother) : "",
    }),
  );
}

{
  const a = animal({ id: "a", earTag: "A", motherId: "a" });
  const tree = buildPedigree({
    rootId: "a",
    generations: 4,
    ...maps([a]),
  });
  check(
    "ciclo (2): un animal es su propia madre (motherId = A)",
    tree.mother.kind === "UNKNOWN",
    kindOf(tree.mother),
  );
}

{
  const gm = animal({ id: "gm", earTag: "70" });
  const mom = animal({ id: "mom", earTag: "80", motherId: "gm" });
  const dad = animal({ id: "dad", earTag: "81", motherId: "gm" });
  const sire: PedigreeSire = {
    id: "sd",
    name: "Padre",
    registrationCode: null,
    isExternal: false,
    linkedAnimalId: "dad",
  };
  const tree = buildPedigree({
    rootId: "r",
    generations: 3,
    ...maps([animal({ ...root, motherId: "mom", sireId: "sd" }), mom, dad, gm], [sire]),
  });
  const same =
    tree.mother.kind === "ANIMAL" &&
    tree.father.kind === "ANIMAL" &&
    tree.mother.mother.kind === "ANIMAL" &&
    tree.father.mother.kind === "ANIMAL" &&
    tree.mother.mother.id === "gm" &&
    tree.father.mother.id === "gm";
  check("el mismo abuelo por las dos líneas", same);
}

{
  const sold = animal({ id: "s", earTag: "9006", status: "SOLD" });
  const tree = buildPedigree({
    rootId: "r",
    generations: 3,
    ...maps([animal({ ...root, motherId: "s" }), sold]),
  });
  check(
    "animal vendido (el estado se conserva)",
    tree.mother.kind === "ANIMAL" && tree.mother.status === "SOLD",
    tree.mother.kind === "ANIMAL" ? tree.mother.status : kindOf(tree.mother),
  );
}

{
  const parent = animal({ id: "p", earTag: "9003" });
  const viaMomNew = animal({
    id: "c1",
    earTag: "9004",
    motherId: "p",
    birthDate: "2026-06-01",
  });
  const viaMomOld = animal({
    id: "c0",
    earTag: "8999",
    motherId: "p",
    birthDate: "2024-01-01",
  });
  const noDate = animal({ id: "c9", earTag: "9011", motherId: "p", birthDate: null });
  const bull = animal({ id: "bull", earTag: "9010" });
  const sire: PedigreeSire = {
    id: "s-own",
    name: "Toro",
    registrationCode: null,
    isExternal: false,
    linkedAnimalId: "p",
  };
  const viaSire = animal({
    id: "c2",
    earTag: "9005",
    sireId: "s-own",
    birthDate: "2025-05-01",
  });
  const kids = listOffspring({
    parentAnimalId: "p",
    animals: [parent, viaMomNew, viaMomOld, noDate, bull, viaSire],
    sires: [sire],
  });
  check(
    "crías por madre y por padre propio, y el orden",
    kids.length === 4 &&
      kids[0].earTag === "9004" &&
      kids[0].via === "MOTHER" &&
      kids[1].earTag === "9005" &&
      kids[1].via === "SIRE" &&
      kids[2].earTag === "8999" &&
      kids[3].earTag === "9011" &&
      kids[3].birthDate === null,
    kids.map((k) => `${k.earTag}:${k.via}`).join(","),
  );
}

if (failed > 0) {
  console.error(`\n${failed} caso(s) fallaron`);
  process.exit(1);
}
console.log("\nTodos los casos OK");
