import { isEid15, matchTyped } from './electronicId.ts'

export type DecodeResult = {
  eid15: string | null
  campos: Record<string, string>
  avisos: string[]
}

export type Decoder = {
  id: string
  nombre: string
  pendiente?: boolean
  decode(trama: Uint8Array, numeroImpreso?: string): DecodeResult
}

const NATIONAL_MAX = 274877906943n

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function bytesToAscii(bytes: Uint8Array): string {
  return [...bytes].map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('')
}

export function textFromBytes(bytes: Uint8Array): string {
  return [...bytes].map((b) => String.fromCharCode(b)).join('')
}

export function isoValueFromLe(bytes: Uint8Array): bigint {
  let valor = 0n
  for (let i = 0; i < bytes.length; i++) {
    valor |= BigInt(bytes[i] ?? 0) << BigInt(i * 8)
  }
  return valor
}

export function isoLeBytesFromValue(valor: bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number((valor >> BigInt(i * 8)) & 0xffn)
  }
  return bytes
}

export function eidToIsoValue(eid15: string, animal = true, dataBlock = false): bigint {
  const country = BigInt(eid15.slice(0, 3))
  const national = BigInt(eid15.slice(3))
  let valor = 0n
  if (animal) valor |= 1n
  if (dataBlock) valor |= 1n << 15n
  valor |= country << 16n
  valor |= national << 26n
  return valor
}

function decodeIso64(valor: bigint): DecodeResult {
  const animal = (valor & 1n) === 1n
  const dataBlock = ((valor >> 15n) & 1n) === 1n
  const country = Number((valor >> 16n) & 0x3ffn)
  const national = valor >> 26n
  const avisos: string[] = []
  if (country === 0) avisos.push('país 0 no es válido')
  if (country > 999) avisos.push(`país ${country} no entra en 3 dígitos`)
  if (national > NATIONAL_MAX || national > 999999999999n) {
    avisos.push('el número nacional no entra en 12 dígitos')
  }
  const campos = {
    pais: String(country),
    nacional: national.toString(),
    indicadorAnimal: animal ? '1' : '0',
    indicadorBloqueDatos: dataBlock ? '1' : '0',
  }
  if (avisos.length > 0) {
    return { eid15: null, campos, avisos }
  }
  const eid15 = String(country).padStart(3, '0') + national.toString().padStart(12, '0')
  if (!isEid15(eid15)) {
    return { eid15: null, campos, avisos: ['identificación inválida'] }
  }
  return { eid15, campos, avisos }
}

function decodeIsoLe(trama: Uint8Array): DecodeResult {
  if (trama.length !== 8) {
    return {
      eid15: null,
      campos: { bytes: String(trama.length) },
      avisos: [`se esperaban 8 bytes, llegaron ${trama.length}`],
    }
  }
  return decodeIso64(isoValueFromLe(trama))
}

function decodeIsoBe(trama: Uint8Array): DecodeResult {
  if (trama.length !== 8) {
    return {
      eid15: null,
      campos: { bytes: String(trama.length) },
      avisos: [`se esperaban 8 bytes, llegaron ${trama.length}`],
    }
  }
  const reversed = Uint8Array.from(trama).reverse()
  return decodeIso64(isoValueFromLe(reversed))
}

function decodeAsciiDigits(trama: Uint8Array): DecodeResult {
  const text = textFromBytes(trama)
  const separated = text.match(/(?<!\d)(\d{3})[_\- ](\d{12})(?!\d)/)
  if (separated?.[1] && separated[2]) {
    const eid15 = `${separated[1]}${separated[2]}`
    return {
      eid15,
      campos: { texto: text.trim(), forma: 'separada' },
      avisos: [],
    }
  }
  const fifteen = text.match(/(?<!\d)\d{15}(?!\d)/)
  if (fifteen?.[0]) {
    return {
      eid15: fifteen[0],
      campos: { texto: text.trim(), forma: '15-digitos' },
      avisos: [],
    }
  }
  const runs = text.match(/\d+/g) ?? []
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0)
  const total = runs.join('').length
  const count = longest || total
  return {
    eid15: null,
    campos: { texto: text.trim(), digitos: String(count) },
    avisos: count ? [`hay ${count} dígitos, se esperaban 15`] : ['no hay dígitos'],
  }
}

function decodeHexRaw(trama: Uint8Array): DecodeResult {
  return {
    eid15: null,
    campos: { hex: bytesToHex(trama), ascii: bytesToAscii(trama) },
    avisos: ['hex crudo: no decodifica'],
  }
}

function decodeAutomatico(trama: Uint8Array, numeroImpreso = ''): DecodeResult {
  if (trama.length === 8) {
    const le = isoLe.decode(trama)
    const be = isoBe.decode(trama)
    if (le.eid15 && be.eid15) {
      const matchLe = matchTyped(numeroImpreso, le.eid15) === 'coincide'
      const matchBe = matchTyped(numeroImpreso, be.eid15) === 'coincide'
      if (matchLe !== matchBe) {
        const selected = matchLe ? le : be
        const selectedDecoder = matchLe ? isoLe.id : isoBe.id
        return {
          ...selected,
          campos: {
            ...selected.campos,
            candidatoLE: le.eid15,
            candidatoBE: be.eid15,
            decodificador: selectedDecoder,
            desambiguadoPor: 'número impreso',
          },
          avisos: ['desambiguado por el número impreso'],
        }
      }
      return {
        ...le,
        campos: {
          ...le.campos,
          candidatoLE: le.eid15,
          candidatoBE: be.eid15,
          decodificador: 'automatico',
        },
        avisos: [...le.avisos, 'ambiguo'],
      }
    }
  }

  const order = [asciiDigits, isoLe, isoBe]
  for (const dec of order) {
    const result = dec.decode(trama)
    if (result.eid15) {
      return {
        ...result,
        campos: { ...result.campos, decodificador: dec.id },
      }
    }
  }
  return {
    eid15: null,
    campos: { decodificador: 'ninguno' },
    avisos: asciiDigits.decode(trama).avisos,
  }
}

export const asciiDigits: Decoder = {
  id: 'ascii-digitos',
  nombre: 'Dígitos ASCII',
  decode: decodeAsciiDigits,
}

export const isoLe: Decoder = {
  id: 'iso11784-8bytes-le',
  nombre: 'ISO 11784 · 8 bytes LE',
  decode: decodeIsoLe,
}

export const isoBe: Decoder = {
  id: 'iso11784-8bytes-be',
  nombre: 'ISO 11784 · 8 bytes BE',
  decode: decodeIsoBe,
}

export const hexCrudo: Decoder = {
  id: 'hex-crudo',
  nombre: 'Hex crudo',
  decode: decodeHexRaw,
}

export const automatico: Decoder = {
  id: 'automatico',
  nombre: 'Automático',
  decode: decodeAutomatico,
}

export const wl134: Decoder = {
  id: 'wl134',
  nombre: 'WL-134 (pendiente: definir con la salida real)',
  pendiente: true,
  decode: decodeAutomatico,
}

export const zocorfid: Decoder = {
  id: 'zocorfid',
  nombre: 'ZOCORFID (pendiente: definir con la salida real)',
  pendiente: true,
  decode: decodeAutomatico,
}

export const DECODERS: Decoder[] = [
  automatico,
  asciiDigits,
  isoLe,
  isoBe,
  hexCrudo,
  wl134,
  zocorfid,
]

export function decoderById(id: string): Decoder {
  return DECODERS.find((d) => d.id === id) ?? automatico
}
