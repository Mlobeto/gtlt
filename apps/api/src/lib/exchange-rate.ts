export interface UsdArsRate {
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

/** Cotización del dólar oficial (compra/venta) vía dolarapi.com — pública, sin API key. */
export async function fetchOficialUsdArsRate(): Promise<UsdArsRate> {
  const res = await fetch("https://dolarapi.com/v1/dolares/oficial");
  if (!res.ok) {
    throw new Error(`dolarapi.com respondió ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  if (typeof data.venta !== "number" || typeof data.compra !== "number") {
    throw new Error("Respuesta inesperada de dolarapi.com");
  }

  return {
    compra: data.compra,
    venta: data.venta,
    fechaActualizacion: String(data.fechaActualizacion ?? ""),
  };
}
