import type { PartFieldKind, PartTypeField } from "@prisma/client";
import { HttpError } from "./http-error.js";

export type PartFieldDef = {
  key: string;
  label: string;
  kind: PartFieldKind;
  unit?: string | null;
  options: string[];
  required: boolean;
  min?: number | null;
  max?: number | null;
  active?: boolean;
};

export type AttributeValue = string | number | boolean;

export type ValidateAttributesOk = {
  ok: true;
  value: Record<string, AttributeValue>;
};

export type ValidateAttributesErr = {
  ok: false;
  errors: string[];
};

export type ValidateAttributesResult = ValidateAttributesOk | ValidateAttributesErr;

export function keyFromFieldLabel(label: string): string {
  const key = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || "campo";
}

function decimalToNumber(value: { toNumber(): number } | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

export function toFieldDef(
  field: Pick<
    PartTypeField,
    "key" | "label" | "kind" | "unit" | "options" | "required" | "min" | "max" | "active"
  >,
): PartFieldDef {
  return {
    key: field.key,
    label: field.label,
    kind: field.kind,
    unit: field.unit,
    options: field.options,
    required: field.required,
    min: decimalToNumber(field.min),
    max: decimalToNumber(field.max),
    active: field.active,
  };
}

export function serializePartTypeField(field: PartTypeField) {
  return {
    id: field.id,
    partTypeId: field.partTypeId,
    key: field.key,
    label: field.label,
    kind: field.kind,
    unit: field.unit,
    options: field.options,
    required: field.required,
    min: decimalToNumber(field.min),
    max: decimalToNumber(field.max),
    helpText: field.helpText,
    sortOrder: field.sortOrder,
    active: field.active,
  };
}

function isEmpty(value: unknown): boolean {
  return value == null || value === "";
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(",", ".");
    if (!trimmed) return null;
    return Number(trimmed);
  }
  return null;
}

export function validatePartAttributes(
  fields: PartFieldDef[],
  raw: unknown,
): ValidateAttributesResult {
  const errors: string[] = [];
  const cleaned: Record<string, AttributeValue> = {};

  if (raw == null) raw = {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["Los datos de la ficha tienen que ser un objeto."] };
  }

  const input = raw as Record<string, unknown>;
  const active = fields.filter((f) => f.active !== false);
  const byKey = new Map(active.map((f) => [f.key, f]));

  for (const key of Object.keys(input)) {
    if (!byKey.has(key)) {
      errors.push(`Campo desconocido: ${key}`);
    }
  }

  for (const field of active) {
    const rawVal = input[field.key];
    if (isEmpty(rawVal)) {
      if (field.required) errors.push(`Completá: ${field.label}`);
      continue;
    }

    if (field.kind === "TEXT") {
      if (typeof rawVal !== "string") {
        errors.push(`${field.label} debe ser texto`);
        continue;
      }
      const text = rawVal.trim();
      if (!text) {
        if (field.required) errors.push(`Completá: ${field.label}`);
        continue;
      }
      if (text.length > 200) {
        errors.push(`${field.label} no puede superar 200 caracteres`);
        continue;
      }
      cleaned[field.key] = text;
      continue;
    }

    if (field.kind === "NUMBER") {
      const num = parseNumber(rawVal);
      if (num == null || !Number.isFinite(num)) {
        errors.push(`${field.label} debe ser un número`);
        continue;
      }
      if (field.min == null && num < 0) {
        errors.push(`${field.label} debe ser un número positivo`);
        continue;
      }
      if (field.min != null && num < field.min) {
        errors.push(`${field.label} debe ser al menos ${field.min}`);
        continue;
      }
      if (field.max != null && num > field.max) {
        errors.push(`${field.label} no puede ser mayor que ${field.max}`);
        continue;
      }
      cleaned[field.key] = num;
      continue;
    }

    if (field.kind === "SELECT") {
      if (typeof rawVal !== "string" || !field.options.includes(rawVal)) {
        errors.push(`${field.label}: elegí una de las opciones`);
        continue;
      }
      cleaned[field.key] = rawVal;
      continue;
    }

    if (field.kind === "BOOLEAN") {
      if (typeof rawVal !== "boolean") {
        errors.push(`${field.label}: elegí sí o no`);
        continue;
      }
      cleaned[field.key] = rawVal;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: cleaned };
}

export function requireValidAttributes(
  fields: PartFieldDef[],
  raw: unknown,
): Record<string, AttributeValue> {
  const result = validatePartAttributes(fields, raw ?? {});
  if (!result.ok) {
    throw new HttpError(400, result.errors.join(" · "), "INVALID_ATTRIBUTES", {
      errors: result.errors,
    });
  }
  return result.value;
}

export function attributesRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
