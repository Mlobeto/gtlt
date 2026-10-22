import { formatEid, matchTyped, parseEid } from './electronicId.ts'
import {
  createFixedLengthFramer,
  createLineFramer,
  createSilenceFramer,
  createStartEndFramer,
} from './framing.ts'
import { asciiDigits, automatico, isoBe, isoLe } from './decoders.ts'
import { findNumberInFrames } from './findNumber.ts'
import { testsToCsv } from './storage.ts'

let failed = 0

function bytes(...hex: number[]) {
  return Uint8Array.from(hex)
}

function textBytes(text: string) {
  return Uint8Array.from([...text].map((ch) => ch.charCodeAt(0)))
}

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`OK  ${name}${detail ? ` · ${detail}` : ''}`)
  } else {
    failed += 1
    console.log(`FALLÓ  ${name}${detail ? ` · ${detail}` : ''}`)
  }
}

const isoA = bytes(0x01, 0x00, 0x20, 0x00, 0x19, 0x37, 0x50, 0x09)
const isoB = bytes(0x01, 0x00, 0xe7, 0x07, 0x00, 0x00, 0x00, 0x00)
const isoC = bytes(0x01, 0x00, 0x20, 0x9c, 0x9f, 0x2f, 0x50, 0x09)

const leA = isoLe.decode(isoA)
const leB = isoLe.decode(isoB)
const leC = isoLe.decode(isoC)
check('ISO LE 032010000123456', leA.eid15 === '032010000123456', String(leA.eid15))
check('ISO LE 999000000000001', leB.eid15 === '999000000000001', String(leB.eid15))
check('ISO LE 032010000000999', leC.eid15 === '032010000000999', String(leC.eid15))

const beA = isoBe.decode(Uint8Array.from(isoA).reverse())
const beB = isoBe.decode(Uint8Array.from(isoB).reverse())
const beC = isoBe.decode(Uint8Array.from(isoC).reverse())
check('ISO BE misma trama A', beA.eid15 === '032010000123456', String(beA.eid15))
check('ISO BE misma trama B', beB.eid15 === '999000000000001', String(beB.eid15))
check('ISO BE misma trama C', beC.eid15 === '032010000000999', String(beC.eid15))

const ambiguousFrame = bytes(0x09, 0x50, 0x37, 0x19, 0x00, 0x20, 0x00, 0x01)
const ambiguousWithoutPrint = automatico.decode(ambiguousFrame)
check(
  'automático informa ambigüedad LE/BE',
  ambiguousWithoutPrint.avisos.includes('ambiguo')
    && ambiguousWithoutPrint.campos.candidatoLE === '311001074266118'
    && ambiguousWithoutPrint.campos.candidatoBE === '032010000123456'
    && ambiguousWithoutPrint.eid15 === '311001074266118',
  JSON.stringify(ambiguousWithoutPrint),
)
const ambiguousResolvedBe = automatico.decode(ambiguousFrame, '032010000123456')
check(
  'automático desambigua a BE por número impreso',
  ambiguousResolvedBe.eid15 === '032010000123456'
    && ambiguousResolvedBe.campos.decodificador === 'iso11784-8bytes-be'
    && ambiguousResolvedBe.avisos.includes('desambiguado por el número impreso')
    && !ambiguousResolvedBe.avisos.includes('ambiguo'),
  JSON.stringify(ambiguousResolvedBe),
)
const ambiguousResolvedLe = automatico.decode(isoA, '032010000123456')
check(
  'automático desambigua a LE por número impreso',
  ambiguousResolvedLe.eid15 === '032010000123456'
    && ambiguousResolvedLe.campos.decodificador === 'iso11784-8bytes-le'
    && ambiguousResolvedLe.avisos.includes('desambiguado por el número impreso')
    && !ambiguousResolvedLe.avisos.includes('ambiguo'),
  JSON.stringify(ambiguousResolvedLe),
)

const shortIso = isoLe.decode(bytes(0x01, 0x00, 0x20, 0x00, 0x19, 0x37, 0x50))
check('ISO 7 bytes inválida', shortIso.eid15 == null && shortIso.avisos.length > 0)

const asciiCases: [string, string][] = [
  ['032_010000123456\r\n', '032010000123456'],
  ['032010000123456\r\n', '032010000123456'],
  ['999 000000000001\r\n', '999000000000001'],
  ['ID:032010000123456;CRC:AB\r\n', '032010000123456'],
]
for (const [raw, expected] of asciiCases) {
  const result = asciiDigits.decode(textBytes(raw))
  check(`ASCII ${JSON.stringify(raw.trim())}`, result.eid15 === expected, String(result.eid15))
}
const fourteen = asciiDigits.decode(textBytes('03201000012345\r\n'))
check(
  'ASCII 14 dígitos',
  fourteen.eid15 == null && fourteen.avisos.some((a) => a.includes('14')),
  fourteen.avisos.join('; '),
)
const sixteen = asciiDigits.decode(textBytes('1032010000123456\r\n'))
check(
  'ASCII 16 dígitos no toma un fragmento',
  sixteen.eid15 == null && sixteen.avisos.some((a) => a.includes('16')),
  sixteen.avisos.join('; '),
)

check('formatEid', formatEid('032010000123456') === '032 010000123456')
const parsed = parseEid('032010000123456')
check('parseEid visual10', parsed?.visual10 === '0000123456', parsed?.visual10 ?? 'null')
check('matchTyped 15', matchTyped('032010000123456', '032010000123456') === 'coincide')
check('matchTyped 12', matchTyped('010000123456', '032010000123456') === 'coincide')
check('matchTyped 10', matchTyped('0000123456', '032010000123456') === 'coincide')
check('matchTyped 9', matchTyped('000123456', '032010000123456') === 'formato_no_reconocido')

const line = createLineFramer()
const part1 = line.push(textBytes('03201000012'), 0)
const part2 = line.push(textBytes('3456\r\n'), 1)
check(
  'framing líneas partido',
  part1.length === 0 && textFrom(part2[0]) === '032010000123456',
  `p1=${part1.length} p2=${part2.map(textFrom).join('|')}`,
)

const silence = createSilenceFramer(50)
const s1 = silence.push(bytes(1, 2, 3), 100)
const s2 = silence.push(bytes(4, 5), 200)
check(
  'framing silencio',
  s1.length === 0 && s2.length === 1 && Array.from(s2[0] ?? []).join(',') === '1,2,3',
)

const fixed = createFixedLengthFramer(3)
const f1 = fixed.push(bytes(1, 2, 3, 4, 5), 0)
check(
  'framing longitud fija',
  f1.length === 1 && Array.from(f1[0] ?? []).join(',') === '1,2,3',
)

const delim = createStartEndFramer(0x02, 0x03)
const d1 = delim.push(bytes(0x02, 0xaa, 0xbb, 0x03, 0x00), 0)
check(
  'framing inicio/fin',
  d1.length === 1 && Array.from(d1[0] ?? []).join(',') === '170,187',
)

const asciiHit = findNumberInFrames([textBytes('032_010000123456\r\n')], '032010000123456')
check(
  'detective ASCII con separador',
  asciiHit.hallazgos.some((h) => h.codificacion.includes('ascii')),
  asciiHit.hallazgos.map((h) => h.codificacion).join(','),
)

const isoHit = findNumberInFrames([isoA], '032010000123456')
check(
  'detective ISO LE crudo',
  isoHit.hallazgos.some((h) => h.codificacion === 'iso11784-8bytes-le'),
  isoHit.hallazgos.map((h) => h.codificacion).join(','),
)
const visualIsoHit = findNumberInFrames([isoA], '0000123456')
check(
  'detective ISO con número visual',
  visualIsoHit.hallazgos.some((h) => h.codificacion === 'iso11784-8bytes-le'),
  visualIsoHit.hallazgos.map((h) => h.codificacion).join(','),
)

const hexOrig = findNumberInFrames([textBytes('0100200019375009')], '032010000123456')
check(
  'detective hex original',
  hexOrig.hallazgos.some((h) => h.codificacion === 'hex-iso-le'),
  hexOrig.hallazgos.map((h) => h.codificacion).join(','),
)

const hexRev = findNumberInFrames([textBytes('0950371900200001')], '032010000123456')
check(
  'detective hex dado vuelta',
  hexRev.hallazgos.some((h) => h.codificacion === 'hex-iso-be'),
  hexRev.hallazgos.map((h) => h.codificacion).join(','),
)

const missing = findNumberInFrames([textBytes('032_010000123456\r\n')], '032010000000001')
check('detective no encuentra otro número', missing.hallazgos.length === 0)

const csv = testsToCsv([{
  id: 'test',
  fechaHora: '2026-01-01T00:00:00.000Z',
  modeloLector: 'Otro',
  puerto: 'Lector A',
  resultado: 'parcial',
  lecturas: 1,
  notas: 'línea uno, "línea dos"\nlínea tres',
}])
check('CSV escapa comillas y saltos', csv.includes('"línea uno, ""línea dos""\nlínea tres"'))

function textFrom(frame: Uint8Array | undefined) {
  if (!frame) return ''
  return [...frame].map((b) => String.fromCharCode(b)).join('')
}

if (failed > 0) {
  console.error(`\n${failed} caso(s) fallaron`)
  process.exit(1)
}
console.log('\nTodos los casos OK')
