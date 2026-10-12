const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

export function generateTemporaryPassword(length = 12) {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join('')
}

export function quantityFor(
  rule: 'PER_BAJADA' | 'PER_PUMP' | 'FIXED',
  fixedQuantity: number | null,
  bajadaCount: number,
  pumpCount: number,
) {
  if (rule === 'PER_BAJADA') return bajadaCount
  if (rule === 'PER_PUMP') return pumpCount
  return fixedQuantity ?? 0
}
