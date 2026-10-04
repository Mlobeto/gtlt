import type { PartTypeField } from "./api";

export type AttributeDraft = Record<string, string | boolean>;

export function powerSupplyLabel(value: "MONOPHASE" | "THREEPHASE" | null | undefined) {
  if (value === "MONOPHASE") return "Monofásica";
  if (value === "THREEPHASE") return "Trifásica";
  return "Sin informar";
}

export function attributesFromSource(
  fields: PartTypeField[] | undefined,
  attributes: Record<string, unknown> | null | undefined,
  coldDetail?: {
    brand: string;
    model: string;
    capacityLiters: string | number;
    coolingCapacity: string;
    controllerModel: string | null;
  } | null,
): AttributeDraft {
  const draft: AttributeDraft = {};
  const source: Record<string, unknown> = { ...(attributes ?? {}) };
  if (coldDetail) {
    if (source.brand == null) source.brand = coldDetail.brand;
    if (source.model == null) source.model = coldDetail.model;
    if (source.tank_capacity_l == null) source.tank_capacity_l = coldDetail.capacityLiters;
    if (source.cooling_capacity == null) source.cooling_capacity = coldDetail.coolingCapacity;
    if (source.controller_model == null && coldDetail.controllerModel) {
      source.controller_model = coldDetail.controllerModel;
    }
  }
  for (const field of fields ?? []) {
    const raw = source[field.key];
    if (raw == null || raw === "") continue;
    draft[field.key] = field.kind === "BOOLEAN" ? raw === true || raw === "true" : String(raw);
  }
  return draft;
}

export function formatAttributeLine(
  fields: PartTypeField[] | undefined,
  attributes: Record<string, unknown> | null | undefined,
  coldDetail?: {
    brand: string;
    model: string;
    capacityLiters: string | number;
    coolingCapacity: string;
    controllerModel?: string | null;
  } | null,
): string {
  const parts: string[] = [];
  const source: Record<string, unknown> = { ...(attributes ?? {}) };
  if ((!attributes || Object.keys(attributes).length === 0) && coldDetail) {
    source.brand = coldDetail.brand;
    source.model = coldDetail.model;
    source.tank_capacity_l = coldDetail.capacityLiters;
    source.cooling_capacity = coldDetail.coolingCapacity;
    if (coldDetail.controllerModel) source.controller_model = coldDetail.controllerModel;
  }
  for (const field of fields ?? []) {
    const raw = source[field.key];
    if (raw == null || raw === "") continue;
    const unit = field.kind === "NUMBER" && field.unit ? ` ${field.unit}` : "";
    const display =
      field.kind === "BOOLEAN" ? (raw === true || raw === "true" ? "Sí" : "No") : String(raw);
    parts.push(`${field.label}: ${display}${unit}`);
  }
  return parts.join(" · ");
}

export function collectAttributes(
  fields: PartTypeField[] | undefined,
  draft: AttributeDraft,
): { ok: true; value: Record<string, string | number | boolean> } | { ok: false; error: string } {
  const value: Record<string, string | number | boolean> = {};
  for (const field of fields ?? []) {
    const raw = draft[field.key];
    const empty = raw == null || raw === "";
    if (empty) {
      if (field.required) return { ok: false, error: `Completá: ${field.label}` };
      continue;
    }
    if (field.kind === "TEXT") {
      const text = String(raw).trim();
      if (!text) {
        if (field.required) return { ok: false, error: `Completá: ${field.label}` };
        continue;
      }
      if (text.length > 200) return { ok: false, error: `${field.label} no puede superar 200 caracteres` };
      value[field.key] = text;
      continue;
    }
    if (field.kind === "NUMBER") {
      const num = Number(String(raw).trim().replace(",", "."));
      if (!Number.isFinite(num)) return { ok: false, error: `${field.label} debe ser un número` };
      if (field.min == null && num < 0) {
        return { ok: false, error: `${field.label} debe ser un número positivo` };
      }
      if (field.min != null && num < field.min) {
        return { ok: false, error: `${field.label} debe ser al menos ${field.min}` };
      }
      if (field.max != null && num > field.max) {
        return { ok: false, error: `${field.label} no puede ser mayor que ${field.max}` };
      }
      value[field.key] = num;
      continue;
    }
    if (field.kind === "SELECT") {
      if (typeof raw !== "string" || !field.options.includes(raw)) {
        return { ok: false, error: `${field.label}: elegí una de las opciones` };
      }
      value[field.key] = raw;
      continue;
    }
    if (typeof raw !== "boolean") {
      return { ok: false, error: `${field.label}: elegí sí o no` };
    }
    value[field.key] = raw;
  }
  return { ok: true, value };
}
