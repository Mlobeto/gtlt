import { matchTyped, parseEid } from './electronicId.ts'

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

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function bytesToAscii(bytes: Uint8Array): string {
  return [...bytes].map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('')
}

export function textFromBytes(bytes: Uint8Array): string {
  return [...bytes].map((b) => String.fromCharCode(b)).join('')
}

export type IsoDisposicion = 'iso-tabla' | 'fdxb-nacional-primero'

export const AVISO_AMBIGUO = 'ambiguo'
export const AVISO_SUMA = 'Suma de control no coincide'
export const AVISO_DESAMBIGUADO = 'desambiguado por el número impreso'
export const MAX_NATIONAL = 274877906943n

const HEX_CHAR = /[0-9A-Fa-f]/

export function esLecturaValida(result: DecodeResult): boolean {
  return Boolean(result.eid15)
    && !result.avisos.includes(AVISO_AMBIGUO)
    && !result.avisos.includes(AVISO_SUMA)
}

function invalid(aviso: string): DecodeResult {
  return { eid15: null, campos: {}, avisos: [aviso] }
}

function bitRange(value: bigint, start: number, length: number): bigint {
  return (value >> BigInt(start)) & ((1n << BigInt(length)) - 1n)
}

export function isoValueFromLe(bytes: Uint8Array): bigint {
  let value = 0n
  for (let i = 0; i < bytes.length; i++) value |= BigInt(bytes[i]!) << BigInt(i * 8)
  return value
}

export function isoLeBytesFromValue(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  for (let i = 0; i < 8; i++) bytes[i] = Number((value >> BigInt(i * 8)) & 0xffn)
  return bytes
}

export function eidToIsoValue(
  eid15: string,
  animalBit = true,
  dataBlock = false,
  disposicion: IsoDisposicion = 'iso-tabla',
): bigint {
  const country = BigInt(eid15.slice(0, 3))
  const national = BigInt(eid15.slice(3))
  if (disposicion === 'fdxb-nacional-primero') {
    let value = national
    value |= country << 38n
    if (dataBlock) value |= 1n << 48n
    if (animalBit) value |= 1n << 63n
    return value
  }
  let value = 0n
  if (animalBit) value |= 1n
  if (dataBlock) value |= 1n << 15n
  value |= country << 16n
  value |= national << 26n
  return value
}

function composeEid(country: number, national: bigint): string | null {
  if (country < 1 || country > 999 || national < 0n || national > MAX_NATIONAL) return null
  return `${String(country).padStart(3, '0')}${national.toString().padStart(12, '0')}`
}

export function decodeIso64(
  valor: bigint,
  decodificador: string,
  disposicion: IsoDisposicion = 'iso-tabla',
): DecodeResult {
  const animal = Number(disposicion === 'iso-tabla' ? bitRange(valor, 0, 1) : bitRange(valor, 63, 1))
  const reserved = disposicion === 'iso-tabla' ? bitRange(valor, 1, 14) : bitRange(valor, 49, 14)
  const dataBlock = Number(disposicion === 'iso-tabla' ? bitRange(valor, 15, 1) : bitRange(valor, 48, 1))
  const country = Number(disposicion === 'iso-tabla' ? bitRange(valor, 16, 10) : bitRange(valor, 38, 10))
  const national = disposicion === 'iso-tabla' ? bitRange(valor, 26, 38) : bitRange(valor, 0, 38)
  const eid15 = composeEid(country, national)
  if (!eid15) {
    return invalid(
      country < 1 || country > 999
        ? 'El código de país está fuera de 1–999.'
        : 'El número nacional no entra en 38 bits.',
    )
  }
  let puntaje = 0
  if (animal === 1) puntaje += 1
  if (reserved === 0n) puntaje += 1
  return {
    eid15,
    campos: {
      decodificador,
      disposicion,
      pais: String(country).padStart(3, '0'),
      nacional: national.toString().padStart(12, '0'),
      animal: String(animal),
      bloqueDatos: String(dataBlock),
      reservados: reserved.toString(16).padStart(4, '0'),
      puntaje: String(puntaje),
    },
    avisos: [],
  }
}

function decodeIsoEndian(
  trama: Uint8Array,
  littleEndian: boolean,
  disposicion: IsoDisposicion,
  id: string,
): DecodeResult {
  if (trama.length !== 8) return invalid('Esta trama no tiene 8 bytes.')
  const ordered = littleEndian ? trama : Uint8Array.from(trama).reverse()
  return decodeIso64(isoValueFromLe(ordered), id, disposicion)
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

function asciiSlice(trama: Uint8Array, start: number, length: number): string {
  return Array.from(trama.slice(start, start + length), (byte) => String.fromCharCode(byte)).join('')
}

function parseReversedHex(text: string): bigint | null {
  if (![...text].every((ch) => HEX_CHAR.test(ch))) return null
  const reversed = [...text].reverse().join('')
  try {
    return BigInt(`0x${reversed}`)
  } catch {
    return null
  }
}

function xorBytes(bytes: Uint8Array): number {
  let value = 0
  for (const byte of bytes) value ^= byte
  return value & 0xff
}

export function buildWl134Frame(
  eid15: string,
  options: { dataBlock?: boolean; animal?: boolean; corruptChecksum?: boolean } = {},
): Uint8Array | null {
  const parsed = parseEid(eid15)
  if (!parsed) return null
  const country = Number(parsed.country)
  const national = BigInt(parsed.national)
  if (country < 1 || country > 999 || national > MAX_NATIONAL) return null
  const nationalHex = [...national.toString(16).toUpperCase().padStart(10, '0')].reverse().join('')
  const countryHex = [...country.toString(16).toUpperCase().padStart(4, '0')].reverse().join('')
  const payloadText = [
    nationalHex,
    countryHex,
    options.dataBlock ? '1' : '0',
    options.animal === false ? '0' : '1',
    '0000',
    '000000',
  ].join('')
  const payload = Uint8Array.from([...payloadText].map((ch) => ch.charCodeAt(0)))
  const checksum = xorBytes(payload)
  const frame = new Uint8Array(30)
  frame[0] = 0x02
  frame.set(payload, 1)
  frame[27] = options.corruptChecksum ? (checksum ^ 0x01) & 0xff : checksum
  frame[28] = checksum ^ 0xff
  frame[29] = 0x03
  return frame
}

function looksLikeWl134(trama: Uint8Array): boolean {
  if (trama.length === 30) return trama[0] === 0x02 && trama[29] === 0x03
  if (trama.length === 28) {
    const data = trama.subarray(0, 26)
    return [...data].every((byte) => HEX_CHAR.test(String.fromCharCode(byte)))
  }
  return false
}

function decodeWl134(trama: Uint8Array): DecodeResult {
  let data: Uint8Array
  let receivedChecksum: number
  let receivedInverse: number
  if (trama.length === 30) {
    if (trama[0] !== 0x02 || trama[29] !== 0x03) {
      return invalid('La trama WL-134 no tiene los delimitadores 0x02 y 0x03.')
    }
    data = trama.subarray(1, 27)
    receivedChecksum = trama[27]!
    receivedInverse = trama[28]!
  } else if (trama.length === 28) {
    data = trama.subarray(0, 26)
    receivedChecksum = trama[26]!
    receivedInverse = trama[27]!
  } else {
    return invalid('La trama WL-134 debe tener 30 bytes (o 28 sin delimitadores).')
  }

  const text = asciiSlice(data, 0, 26)
  if (![...text].every((ch) => HEX_CHAR.test(ch))) {
    return invalid('La trama WL-134 tiene caracteres que no son hexadecimales.')
  }

  const national = parseReversedHex(asciiSlice(data, 0, 10))
  const countryValue = parseReversedHex(asciiSlice(data, 10, 4))
  if (national == null || countryValue == null) {
    return invalid('No se pudo leer el país o el nacional en hexadecimal.')
  }
  const country = Number(countryValue)
  const eid15 = composeEid(country, national)
  if (!eid15) {
    return invalid(
      country < 1 || country > 999
        ? 'El código de país está fuera de 1–999.'
        : 'El número nacional no entra en 38 bits.',
    )
  }

  const calculated = xorBytes(data)
  const calculatedInverse = calculated ^ 0xff
  const checksumOk = receivedChecksum === calculated
  const inverseOk = receivedInverse === calculatedInverse
  const confirmed = checksumOk && inverseOk
  const avisos = confirmed ? [] : [AVISO_SUMA]
  return {
    eid15,
    campos: {
      decodificador: 'wl134',
      formato: confirmed ? 'confirmado por suma de control' : 'dudosa',
      pais: String(country).padStart(3, '0'),
      nacional: national.toString().padStart(12, '0'),
      animal: asciiSlice(data, 15, 1),
      bloqueDatos: asciiSlice(data, 14, 1),
      sumaRecibida: receivedChecksum.toString(16).padStart(2, '0'),
      sumaCalculada: calculated.toString(16).padStart(2, '0'),
      sumaCoincide: checksumOk ? 'si' : 'no',
      inversaRecibida: receivedInverse.toString(16).padStart(2, '0'),
      inversaCalculada: calculatedInverse.toString(16).padStart(2, '0'),
      inversaCoincide: inverseOk ? 'si' : 'no',
    },
    avisos,
  }
}

type IsoCandidate = {
  id: string
  endian: 'le' | 'be'
  disposicion: IsoDisposicion
  result: DecodeResult
}

function iso8Candidates(trama: Uint8Array): IsoCandidate[] {
  return [
    { id: 'iso11784-8bytes-le', endian: 'le', disposicion: 'iso-tabla', result: decodeIsoEndian(trama, true, 'iso-tabla', 'iso11784-8bytes-le') },
    { id: 'iso11784-8bytes-be', endian: 'be', disposicion: 'iso-tabla', result: decodeIsoEndian(trama, false, 'iso-tabla', 'iso11784-8bytes-be') },
    { id: 'iso11784-8bytes-le-fdxb', endian: 'le', disposicion: 'fdxb-nacional-primero', result: decodeIsoEndian(trama, true, 'fdxb-nacional-primero', 'iso11784-8bytes-le-fdxb') },
    { id: 'iso11784-8bytes-be-fdxb', endian: 'be', disposicion: 'fdxb-nacional-primero', result: decodeIsoEndian(trama, false, 'fdxb-nacional-primero', 'iso11784-8bytes-be-fdxb') },
  ]
}

function candidateFields(candidates: IsoCandidate[]): Record<string, string> {
  const campos: Record<string, string> = {}
  const le = candidates.find((item) => item.id === 'iso11784-8bytes-le')
  const be = candidates.find((item) => item.id === 'iso11784-8bytes-be')
  if (le?.result.eid15) campos.candidatoLE = le.result.eid15
  if (be?.result.eid15) campos.candidatoBE = be.result.eid15
  for (const item of candidates) {
    if (!item.result.eid15) continue
    campos[`candidato:${item.id}`] = item.result.eid15
    campos[`puntaje:${item.id}`] = item.result.campos.puntaje ?? '0'
  }
  return campos
}

function pickIsoCandidate(chosen: IsoCandidate, avisos: string[], all: IsoCandidate[]): DecodeResult {
  return {
    eid15: chosen.result.eid15,
    campos: {
      ...chosen.result.campos,
      decodificador: chosen.id,
      ...candidateFields(all),
    },
    avisos,
  }
}

function decodeAutomatico(trama: Uint8Array, numeroImpreso?: string): DecodeResult {
  if (looksLikeWl134(trama)) {
    const result = decodeWl134(trama)
    return { ...result, campos: { ...result.campos, decodificador: 'wl134' } }
  }

  if (trama.length === 8) {
    const candidates = iso8Candidates(trama)
    const valid = candidates.filter((item) => item.result.eid15)
    const printed = numeroImpreso?.trim() ? valid.filter((item) => matchTyped(numeroImpreso, item.result.eid15 ?? '') === 'coincide') : []
    if (printed.length === 1) {
      return pickIsoCandidate(printed[0]!, [AVISO_DESAMBIGUADO], candidates)
    }
    if (printed.length > 1) {
      const first = printed[0]!
      return {
        eid15: first.result.eid15,
        campos: { decodificador: 'automatico', ...candidateFields(candidates) },
        avisos: [AVISO_AMBIGUO],
      }
    }
    const score2 = valid.filter((item) => item.result.campos.puntaje === '2')
    const isoTablaValid = valid.filter((item) => item.disposicion === 'iso-tabla')
    if (!numeroImpreso?.trim() && score2.length === 1) {
      const winner = score2[0]!
      const bothTabla = isoTablaValid.length === 2
      if (!(bothTabla && winner.disposicion === 'iso-tabla')) {
        return pickIsoCandidate(winner, [], candidates)
      }
    }
    if (valid.length === 1) {
      return pickIsoCandidate(valid[0]!, [], candidates)
    }
    if (valid.length > 1) {
      const le = valid.find((item) => item.id === 'iso11784-8bytes-le') ?? valid[0]!
      return {
        eid15: le.result.eid15,
        campos: {
          ...le.result.campos,
          decodificador: 'automatico',
          ...candidateFields(candidates),
        },
        avisos: [AVISO_AMBIGUO],
      }
    }
  }

  const ordered: Decoder[] = [asciiDigits, isoLe, isoBe]
  const hits = ordered
    .map((decoder) => ({ decoder, result: decoder.decode(trama, numeroImpreso) }))
    .filter((item) => item.result.eid15)
  if (hits.length === 0) return invalid('Ningún decodificador reconoció la trama.')
  if (hits.length === 1) {
    return { ...hits[0]!.result, campos: { ...hits[0]!.result.campos, decodificador: hits[0]!.decoder.id } }
  }
  return {
    eid15: hits[0]!.result.eid15,
    campos: { decodificador: 'automatico' },
    avisos: ['Varios decodificadores coinciden; revisá el resultado.'],
  }
}

export const asciiDigits: Decoder = {
  id: 'ascii-digitos',
  nombre: 'Texto con dígitos (ASCII)',
  decode: decodeAsciiDigits,
}

export const isoLe: Decoder = {
  id: 'iso11784-8bytes-le',
  nombre: 'ISO 11784 8 bytes · tabla · little-endian',
  decode: (trama) => decodeIsoEndian(trama, true, 'iso-tabla', 'iso11784-8bytes-le'),
}

export const isoBe: Decoder = {
  id: 'iso11784-8bytes-be',
  nombre: 'ISO 11784 8 bytes · tabla · big-endian',
  decode: (trama) => decodeIsoEndian(trama, false, 'iso-tabla', 'iso11784-8bytes-be'),
}

export const isoLeFdxb: Decoder = {
  id: 'iso11784-8bytes-le-fdxb',
  nombre: 'FDX-B 64 bits · nacional primero · little-endian',
  decode: (trama) => decodeIsoEndian(trama, true, 'fdxb-nacional-primero', 'iso11784-8bytes-le-fdxb'),
}

export const isoBeFdxb: Decoder = {
  id: 'iso11784-8bytes-be-fdxb',
  nombre: 'FDX-B 64 bits · nacional primero · big-endian',
  decode: (trama) => decodeIsoEndian(trama, false, 'fdxb-nacional-primero', 'iso11784-8bytes-be-fdxb'),
}

export const wl134: Decoder = {
  id: 'wl134',
  nombre: 'WL-134 · formato publicado (se confirma con la suma de control)',
  decode: decodeWl134,
}

export const hexCrudo: Decoder = {
  id: 'hex-crudo',
  nombre: 'Hex crudo',
  decode: (trama) => ({
    eid15: null,
    campos: { hex: bytesToHex(trama), ascii: bytesToAscii(trama) },
    avisos: ['hex crudo: no decodifica'],
  }),
}

export const zocorfid: Decoder = {
  id: 'zocorfid',
  nombre: 'ZOCORFID (pendiente: definir con la salida real)',
  pendiente: true,
  decode: decodeAutomatico,
}

export const automatico: Decoder = {
  id: 'automatico',
  nombre: 'Automático (prueba varios)',
  decode: decodeAutomatico,
}

export const DECODERS: Decoder[] = [automatico, asciiDigits, isoLe, isoBe, isoLeFdxb, isoBeFdxb, hexCrudo, wl134, zocorfid]

export function decoderById(id: string): Decoder {
  return DECODERS.find((item) => item.id === id) ?? automatico
}
