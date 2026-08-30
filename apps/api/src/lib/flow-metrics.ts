export function calculateAreaUnderCurve(
  pulses: Array<{ deltaTSeconds: number }>,
): number {
  if (pulses.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < pulses.length; i += 1) {
    const prev = pulses[i - 1].deltaTSeconds;
    const curr = pulses[i].deltaTSeconds;
    total += ((prev + curr) / 2) * 1;
  }

  return Number(total.toFixed(4));
}

/**
 * Placeholder simple para pasar a litros hasta calibrar con mediciones reales.
 * TODO: recalibrar con datos de balanza / caudalímetro real.
 */
export function estimateLiters(args: {
  pulseCount: number;
  areaUnderCurve: number;
}): number {
  const { pulseCount, areaUnderCurve } = args;
  const liters = (pulseCount * 0.018) + (areaUnderCurve * 0.06);
  return Number(Math.max(liters, 0).toFixed(2));
}
