import { HttpError } from "./http-error.js";

export function parseInstalledAt(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "La fecha de instalación no es válida.");
  }
  const min = new Date("2000-01-01T00:00:00.000Z");
  const max = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (date < min) {
    throw new HttpError(400, "La fecha de instalación no puede ser anterior a 2000-01-01.");
  }
  if (date > max) {
    throw new HttpError(400, "La fecha de instalación no puede estar más de un día en el futuro.");
  }
  return date;
}

export function wholeDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.round((end - start) / 86_400_000));
}
