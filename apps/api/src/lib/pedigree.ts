export type PedigreeAnimal = {
  id: string;
  earTag: string;
  status: string;
  birthDate: string | null;
  breed: string | null;
  photoUrl: string | null;
  tamboId: string;
  tamboName: string;
  motherId: string | null;
  sireId: string | null;
  deletedAt: string | Date | null;
};

export type PedigreeSire = {
  id: string;
  name: string;
  registrationCode: string | null;
  isExternal: boolean;
  linkedAnimalId: string | null;
};

export type AncestorNode =
  | {
      kind: "ANIMAL";
      id: string;
      earTag: string;
      status: string;
      birthDate: string | null;
      breed: string | null;
      photoUrl: string | null;
      tamboId: string;
      tamboName: string;
      mother: AncestorNode;
      father: AncestorNode;
      truncated: boolean;
    }
  | {
      kind: "SIRE";
      sireId: string;
      name: string;
      registrationCode: string | null;
      isExternal: boolean;
    }
  | { kind: "UNKNOWN" };

export type OffspringRow = {
  id: string;
  earTag: string;
  status: string;
  birthDate: string | null;
  breed: string | null;
  photoUrl: string | null;
  via: "MOTHER" | "SIRE";
};

export const UNKNOWN: AncestorNode = { kind: "UNKNOWN" };

export function dateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function isDeleted(animal: PedigreeAnimal): boolean {
  return animal.deletedAt != null && animal.deletedAt !== "";
}

function animalCard(
  animal: PedigreeAnimal,
  mother: AncestorNode,
  father: AncestorNode,
  truncated: boolean,
): AncestorNode {
  return {
    kind: "ANIMAL",
    id: animal.id,
    earTag: animal.earTag,
    status: animal.status,
    birthDate: dateOnly(animal.birthDate),
    breed: animal.breed,
    photoUrl: animal.photoUrl,
    tamboId: animal.tamboId,
    tamboName: animal.tamboName,
    mother,
    father,
    truncated,
  };
}

function hasLoadedParents(animal: PedigreeAnimal): boolean {
  return Boolean(animal.motherId || animal.sireId);
}

function animalNode(
  id: string,
  generationsLeft: number,
  path: string[],
  animalsById: Map<string, PedigreeAnimal>,
  siresById: Map<string, PedigreeSire>,
): AncestorNode {
  if (path.includes(id)) return { kind: "UNKNOWN" };
  const animal = animalsById.get(id);
  if (!animal || isDeleted(animal)) return { kind: "UNKNOWN" };

  const nextPath = [...path, id];
  if (generationsLeft <= 1) {
    return animalCard(animal, UNKNOWN, UNKNOWN, hasLoadedParents(animal));
  }

  return animalCard(
    animal,
    resolveMother(animal.motherId, generationsLeft - 1, nextPath, animalsById, siresById),
    resolveFather(animal.sireId, generationsLeft - 1, nextPath, animalsById, siresById),
    false,
  );
}

function resolveMother(
  motherId: string | null,
  generationsLeft: number,
  path: string[],
  animalsById: Map<string, PedigreeAnimal>,
  siresById: Map<string, PedigreeSire>,
): AncestorNode {
  if (!motherId) return { kind: "UNKNOWN" };
  return animalNode(motherId, generationsLeft, path, animalsById, siresById);
}

function resolveFather(
  sireId: string | null,
  generationsLeft: number,
  path: string[],
  animalsById: Map<string, PedigreeAnimal>,
  siresById: Map<string, PedigreeSire>,
): AncestorNode {
  if (!sireId) return { kind: "UNKNOWN" };
  const sire = siresById.get(sireId);
  if (!sire) return { kind: "UNKNOWN" };
  if (sire.linkedAnimalId) {
    return animalNode(sire.linkedAnimalId, generationsLeft, path, animalsById, siresById);
  }
  return {
    kind: "SIRE",
    sireId: sire.id,
    name: sire.name,
    registrationCode: sire.registrationCode,
    isExternal: sire.isExternal,
  };
}

export function buildPedigree(input: {
  rootId: string;
  animalsById: Map<string, PedigreeAnimal>;
  siresById: Map<string, PedigreeSire>;
  generations: number;
}): { mother: AncestorNode; father: AncestorNode } {
  const { rootId, animalsById, siresById, generations } = input;
  const root = animalsById.get(rootId);
  if (!root || isDeleted(root) || generations < 1) {
    return { mother: { kind: "UNKNOWN" }, father: { kind: "UNKNOWN" } };
  }
  const path = [rootId];
  return {
    mother: resolveMother(root.motherId, generations, path, animalsById, siresById),
    father: resolveFather(root.sireId, generations, path, animalsById, siresById),
  };
}

export function listOffspring(input: {
  parentAnimalId: string;
  animals: PedigreeAnimal[];
  sires: PedigreeSire[];
}): OffspringRow[] {
  const { parentAnimalId, animals, sires } = input;
  const ownSireIds = new Set(
    sires.filter((s) => s.linkedAnimalId === parentAnimalId).map((s) => s.id),
  );
  const rows: OffspringRow[] = [];
  const seen = new Set<string>();

  for (const a of animals) {
    if (isDeleted(a) || seen.has(a.id)) continue;
    let via: OffspringRow["via"] | null = null;
    if (a.motherId === parentAnimalId) via = "MOTHER";
    else if (a.sireId && ownSireIds.has(a.sireId)) via = "SIRE";
    if (!via) continue;
    seen.add(a.id);
    rows.push({
      id: a.id,
      earTag: a.earTag,
      status: a.status,
      birthDate: dateOnly(a.birthDate),
      breed: a.breed,
      photoUrl: a.photoUrl,
      via,
    });
  }

  rows.sort((a, b) => {
    if (!a.birthDate && !b.birthDate) return a.earTag.localeCompare(b.earTag, "es", { numeric: true });
    if (!a.birthDate) return 1;
    if (!b.birthDate) return -1;
    return b.birthDate.localeCompare(a.birthDate);
  });
  return rows;
}
