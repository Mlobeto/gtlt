export type TestResultado = 'leyo_ok' | 'parcial' | 'no_leyo' | 'leyo_mal'

export type ReaderLabTest = {
  id: string
  fechaHora: string
  modeloLector: string
  puerto: string
  distanciaCm?: number
  lugar?: string
  metalCerca?: boolean
  bombaEncendida?: boolean
  numeroImpreso?: string
  resultado: TestResultado
  lecturas: number
  duracionSeg?: number
  notas: string
  muestra?: string
}

const KEY = 'cal-reader-lab-tests-v1'

export type StorageNotice = string | null

function readRaw(): { tests: ReaderLabTest[]; notice: StorageNotice } {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { tests: [], notice: null }
    const parsed = JSON.parse(raw) as ReaderLabTest[]
    return { tests: Array.isArray(parsed) ? parsed : [], notice: null }
  } catch {
    return { tests: [], notice: 'No se pudieron leer las pruebas guardadas en este navegador.' }
  }
}

function writeRaw(tests: ReaderLabTest[]): StorageNotice {
  try {
    localStorage.setItem(KEY, JSON.stringify(tests))
    return null
  } catch {
    return 'No se pudo guardar (almacenamiento lleno o bloqueado). La prueba sigue en pantalla.'
  }
}

export function listTests(): { tests: ReaderLabTest[]; notice: StorageNotice } {
  const { tests, notice } = readRaw()
  return {
    tests: [...tests].sort((a, b) => (a.fechaHora < b.fechaHora ? 1 : -1)),
    notice,
  }
}

export function addTest(test: Omit<ReaderLabTest, 'id' | 'fechaHora'> & { id?: string; fechaHora?: string }): {
  tests: ReaderLabTest[]
  notice: StorageNotice
} {
  const { tests, notice: readNotice } = listTests()
  const row: ReaderLabTest = {
    ...test,
    id: test.id ?? crypto.randomUUID(),
    fechaHora: test.fechaHora ?? new Date().toISOString(),
  }
  const next = [row, ...tests]
  const writeNotice = writeRaw(next)
  return { tests: next, notice: writeNotice ?? readNotice }
}

export function deleteTest(id: string): { tests: ReaderLabTest[]; notice: StorageNotice } {
  const { tests, notice: readNotice } = listTests()
  const next = tests.filter((t) => t.id !== id)
  const writeNotice = writeRaw(next)
  return { tests: next, notice: writeNotice ?? readNotice }
}

function csvCell(value: string | number | boolean | undefined): string {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function testsToCsv(tests: ReaderLabTest[]): string {
  const header = [
    'id',
    'fechaHora',
    'modeloLector',
    'puerto',
    'distanciaCm',
    'lugar',
    'metalCerca',
    'bombaEncendida',
    'numeroImpreso',
    'resultado',
    'lecturas',
    'duracionSeg',
    'notas',
    'muestra',
  ]
  const lines = [
    header.join(','),
    ...tests.map((t) =>
      [
        csvCell(t.id),
        csvCell(t.fechaHora),
        csvCell(t.modeloLector),
        csvCell(t.puerto),
        csvCell(t.distanciaCm),
        csvCell(t.lugar),
        csvCell(t.metalCerca),
        csvCell(t.bombaEncendida),
        csvCell(t.numeroImpreso),
        csvCell(t.resultado),
        csvCell(t.lecturas),
        csvCell(t.duracionSeg),
        csvCell(t.notas),
        csvCell(t.muestra),
      ].join(','),
    ),
  ]
  return lines.join('\r\n')
}
