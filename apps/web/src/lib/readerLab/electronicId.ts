export type ParsedEid = {
  country: string
  national: string
  visual10: string
}

export type MatchTypedResult = 'coincide' | 'no_coincide' | 'formato_no_reconocido'

const DIGITS = /^\d+$/

export function normalizeTyped(texto: string): string {
  return texto.replace(/[\s\-_]/g, '')
}

export function isEid15(eid15: string): boolean {
  return eid15.length === 15 && DIGITS.test(eid15)
}

export function formatEid(eid15: string): string {
  const parsed = parseEid(eid15)
  if (!parsed) return eid15
  return `${parsed.country} ${parsed.national}`
}

export function parseEid(eid15: string): ParsedEid | null {
  const digits = normalizeTyped(eid15)
  if (!isEid15(digits)) return null
  const country = digits.slice(0, 3)
  const national = digits.slice(3)
  return {
    country,
    national,
    visual10: national.slice(-10),
  }
}

export function matchTyped(typedDigits: string, eid15: string): MatchTypedResult {
  const typed = normalizeTyped(typedDigits)
  const parsed = parseEid(eid15)
  if (!parsed || !DIGITS.test(typed)) return 'formato_no_reconocido'
  if (typed.length === 15) return typed === eid15 ? 'coincide' : 'no_coincide'
  if (typed.length === 12) return typed === parsed.national ? 'coincide' : 'no_coincide'
  if (typed.length === 10) return typed === parsed.visual10 ? 'coincide' : 'no_coincide'
  return 'formato_no_reconocido'
}
