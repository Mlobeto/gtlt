import { isEid15, matchTyped, normalizeTyped, parseEid } from './electronicId.ts'
import { automatico, bytesToHex, eidToIsoValue, isoLeBytesFromValue, textFromBytes } from './decoders.ts'

export type NumberHit = {
  codificacion: string
  indiceTrama: number
  desplazamiento: number
  longitud: number
}

export type FindNumberResult = {
  hallazgos: NumberHit[]
  motivo?: string
}

function findSubarray(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

function findAscii(text: string, needle: string): number {
  return text.indexOf(needle)
}

function digitsToBytes(digits: string): Uint8Array {
  return Uint8Array.from([...digits].map((ch) => ch.charCodeAt(0)))
}

function toBcd(digits: string, padEnd: boolean): Uint8Array {
  const padded = digits.length % 2 === 0 ? digits : padEnd ? `${digits}0` : `0${digits}`
  const out = new Uint8Array(padded.length / 2)
  for (let i = 0; i < out.length; i++) {
    const hi = Number(padded[i * 2])
    const lo = Number(padded[i * 2 + 1])
    out[i] = (hi << 4) | lo
  }
  return out
}

function pushHit(
  hallazgos: NumberHit[],
  seen: Set<string>,
  hit: NumberHit,
) {
  const key = `${hit.codificacion}:${hit.indiceTrama}:${hit.desplazamiento}:${hit.longitud}`
  if (seen.has(key)) return
  seen.add(key)
  hallazgos.push(hit)
}

export function findNumberInFrames(
  tramas: Uint8Array[],
  numeroImpreso: string,
): FindNumberResult {
  const digits = normalizeTyped(numeroImpreso)
  if (!/^\d+$/.test(digits) || ![10, 12, 15].includes(digits.length)) {
    return {
      hallazgos: [],
      motivo: 'El número tipeado tiene que tener 10, 12 o 15 dígitos.',
    }
  }

  const typedEid = isEid15(digits) ? digits : null

  const hallazgos: NumberHit[] = []
  const seen = new Set<string>()

  tramas.forEach((trama, indiceTrama) => {
    const detectedEid = automatico.decode(trama).eid15
    const matchingEid = typedEid ?? (
      detectedEid && matchTyped(digits, detectedEid) === 'coincide' ? detectedEid : null
    )
    const parsed = matchingEid ? parseEid(matchingEid) : null
    const needlesAscii = [digits]
    if (parsed) {
      const full = `${parsed.country}${parsed.national}`
      needlesAscii.push(full, parsed.national, parsed.visual10)
      needlesAscii.push(
        `${parsed.country}_${parsed.national}`,
        `${parsed.country} ${parsed.national}`,
        `${parsed.country}-${parsed.national}`,
      )
    }
    const text = textFromBytes(trama)
    for (const needle of needlesAscii) {
      const at = findAscii(text, needle)
      if (at >= 0) {
        pushHit(hallazgos, seen, {
          codificacion: needle.includes('_') || needle.includes(' ') || needle.includes('-')
            ? 'ascii-separador'
            : 'ascii-digitos',
          indiceTrama,
          desplazamiento: at,
          longitud: needle.length,
        })
      }
      const reversed = [...needle].reverse().join('')
      const atRev = findAscii(text, reversed)
      if (atRev >= 0) {
        pushHit(hallazgos, seen, {
          codificacion: 'ascii-inverso',
          indiceTrama,
          desplazamiento: atRev,
          longitud: reversed.length,
        })
      }
    }

    if (parsed && matchingEid) {
      const le = isoLeBytesFromValue(eidToIsoValue(matchingEid))
      const be = Uint8Array.from(le).reverse()
      const hexLe = bytesToHex(le)
      const hexBe = bytesToHex(be)
      const textUpper = text.toUpperCase()
      const hexAtLe = textUpper.indexOf(hexLe)
      if (hexAtLe >= 0) {
        pushHit(hallazgos, seen, {
          codificacion: 'hex-iso-le',
          indiceTrama,
          desplazamiento: hexAtLe,
          longitud: hexLe.length,
        })
      }
      const hexAtBe = textUpper.indexOf(hexBe)
      if (hexAtBe >= 0) {
        pushHit(hallazgos, seen, {
          codificacion: 'hex-iso-be',
          indiceTrama,
          desplazamiento: hexAtBe,
          longitud: hexBe.length,
        })
      }
      const rawLe = findSubarray(trama, le)
      if (rawLe >= 0) {
        pushHit(hallazgos, seen, {
          codificacion: 'iso11784-8bytes-le',
          indiceTrama,
          desplazamiento: rawLe,
          longitud: 8,
        })
      }
      const rawBe = findSubarray(trama, be)
      if (rawBe >= 0) {
        pushHit(hallazgos, seen, {
          codificacion: 'iso11784-8bytes-be',
          indiceTrama,
          desplazamiento: rawBe,
          longitud: 8,
        })
      }
    }

    const bcdValues = new Set([digits])
    if (parsed) {
      bcdValues.add(parsed.national)
      bcdValues.add(parsed.visual10)
      bcdValues.add(`${parsed.country}${parsed.national}`)
    }
    for (const value of bcdValues) {
      for (const variant of [toBcd(value, false), toBcd(value, true)]) {
        const at = findSubarray(trama, variant)
        if (at >= 0) {
          pushHit(hallazgos, seen, {
            codificacion: 'bcd',
            indiceTrama,
            desplazamiento: at,
            longitud: variant.length,
          })
        }
        const rev = Uint8Array.from(variant).reverse()
        const atRev = findSubarray(trama, rev)
        if (atRev >= 0) {
          pushHit(hallazgos, seen, {
            codificacion: 'bcd-invertido',
            indiceTrama,
            desplazamiento: atRev,
            longitud: rev.length,
          })
        }
      }
    }

    const asciiBytes = digitsToBytes(digits)
    const atBytes = findSubarray(trama, asciiBytes)
    if (atBytes >= 0) {
      pushHit(hallazgos, seen, {
        codificacion: 'ascii-digitos',
        indiceTrama,
        desplazamiento: atBytes,
        longitud: asciiBytes.length,
      })
    }
  })

  return { hallazgos }
}
