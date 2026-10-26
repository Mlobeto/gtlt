import { useEffect, useRef, useState } from 'react'
import {
  AVISO_SUMA,
  buildWl134Frame,
  bytesToAscii,
  bytesToHex,
  decoderById,
  DECODERS,
  eidToIsoValue,
  esLecturaValida,
  isoLeBytesFromValue,
} from '../lib/readerLab/decoders'
import { matchTyped, normalizeTyped } from '../lib/readerLab/electronicId'
import { findNumberInFrames, type FindNumberResult } from '../lib/readerLab/findNumber'
import { addTest, deleteTest, listTests, testsToCsv, type TestResultado } from '../lib/readerLab/storage'
import { createFramer, type Framer, type FramingKind } from '../lib/readerLab/framing'
import { Badge, Button, Card, EmptyState, Field, SelectField } from './ui'

type Model = 'WL-134' | 'ZOCORFID' | 'Otro'
type SimFormat = 'ascii-separador' | 'ascii-15' | 'iso-le' | 'iso-be' | 'fdxb-le' | 'fdxb-be' | 'wl134' | 'wl134-suma-mala'
type PortState = {
  id: string
  name: string
  model: Model
  source: 'serial' | 'simulado'
  serialPort?: SerialPort
  connected: boolean
  paused: boolean
  config: {
    baudRate: number
    dataBits: 7 | 8
    stopBits: 1 | 2
    parity: 'none' | 'even' | 'odd'
    framing: FramingKind
    silenceMs: number
    frameLength: number
    startHex: string
    endHex: string
    decoder: string
    simFormat: SimFormat
    simInterval: number
    simNoise: boolean
  }
  raw: RawReception[]
  frames: CapturedFrame[]
  byteCount: number
  frameCount: number
  validCount: number
  validTimes: number[]
  distinctEids: string[]
}
type RawReception = {
  time: number
  delta: number | null
  bytes: Uint8Array
}
type CapturedFrame = {
  time: number
  bytes: Uint8Array
  eid15: string | null
  decoder: string
  warning: string
  ambiguous: boolean
  dudosa?: boolean
  wl134Confirmado?: boolean
  candidateLE?: string
  candidateBE?: string
}
type Connection = {
  framer: Framer
  reader?: ReadableStreamDefaultReader<Uint8Array>
  timer?: number
  previousRawTime: number | null
  paused: boolean
  simulatedIndex: number
}
type TimedSummary = {
  portId: string
  duration: number
  frames: number
  valid: number
  ambiguous: number
  matched: number
  mismatched: number
  distinct: number
  perSecond: number
  result: TestResultado
}
type TimedRun = {
  portId: string
  duration: number
  startedAt: number
  printedNumber: string
}

const SAMPLE_EIDS = ['032010000123456', '999000000000001', '032010000000999']
const PORT_COLORS = [
  'bg-primary text-on-primary',
  'bg-brand-blue text-white',
  'bg-success-text text-white',
  'bg-accent text-ink',
  'bg-danger text-white',
  'bg-accent-soft text-accent-text',
]
let nextPortNumber = 1

function newPort(source: PortState['source'], serialPort?: SerialPort): PortState {
  const number = nextPortNumber++
  return {
    id: `${source}-${Date.now()}-${number}`,
    name: `Lector ${String.fromCharCode(64 + number)}`,
    model: 'Otro',
    source,
    serialPort,
    connected: false,
    paused: false,
    config: {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      framing: 'lineas',
      silenceMs: 40,
      frameLength: 8,
      startHex: '02',
      endHex: '03',
      decoder: 'automatico',
      simFormat: 'ascii-separador',
      simInterval: 1000,
      simNoise: false,
    },
    raw: [],
    frames: [],
    byteCount: 0,
    frameCount: 0,
    validCount: 0,
    validTimes: [],
    distinctEids: [],
  }
}

function timeLabel(time: number): string {
  const date = new Date(time)
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function rawLine(entry: RawReception): string {
  const delta = entry.delta == null ? '— ms' : `+${entry.delta} ms`
  return `${timeLabel(entry.time)}  ${delta}  ${entry.bytes.length} bytes  ${bytesToHex(entry.bytes)}  ${bytesToAscii(entry.bytes)}`
}

function hexByte(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 16)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 255 ? parsed : fallback
}

function makeFrame(eid: string, format: SimFormat): Uint8Array {
  if (format === 'ascii-separador') {
    return new TextEncoder().encode(`${eid.slice(0, 3)}_${eid.slice(3)}\r\n`)
  }
  if (format === 'ascii-15') return new TextEncoder().encode(`${eid}\r\n`)
  if (format === 'wl134' || format === 'wl134-suma-mala') {
    return buildWl134Frame(eid, { corruptChecksum: format === 'wl134-suma-mala' }) ?? new Uint8Array()
  }
  if (format === 'fdxb-le' || format === 'fdxb-be') {
    const le = isoLeBytesFromValue(eidToIsoValue(eid, true, false, 'fdxb-nacional-primero'))
    return format === 'fdxb-be' ? Uint8Array.from(le).reverse() : le
  }
  const le = isoLeBytesFromValue(eidToIsoValue(eid))
  return format === 'iso-be' ? Uint8Array.from(le).reverse() : le
}

function framerOptions(config: PortState['config']) {
  return {
    silenceMs: config.silenceMs,
    length: config.frameLength,
    start: hexByte(config.startHex, 0x02),
    end: hexByte(config.endHex, 0x03),
    requireEnd: config.framing !== 'inicio-largo' || config.endHex.trim() !== '',
  }
}

function makeFramer(port: PortState): Framer {
  return createFramer(port.config.framing, framerOptions(port.config))
}

export function ReaderLabTab() {
  const [ports, setPorts] = useState<PortState[]>([])
  const [message, setMessage] = useState('')
  const [clockNow, setClockNow] = useState(0)
  const [selectedRawId, setSelectedRawId] = useState('')
  const [printedNumber, setPrintedNumber] = useState('')
  const [detectivePortId, setDetectivePortId] = useState('')
  const [findResult, setFindResult] = useState<FindNumberResult | null>(null)
  const [testPortId, setTestPortId] = useState('')
  const [testDuration, setTestDuration] = useState(10)
  const [testRun, setTestRun] = useState<TimedRun | null>(null)
  const [testSummary, setTestSummary] = useState<TimedSummary | null>(null)
  const [testStorage, setTestStorage] = useState(() => listTests())
  const testRecords = testStorage.tests
  const [distanceCm, setDistanceCm] = useState('')
  const [testPlace, setTestPlace] = useState('')
  const [metalNear, setMetalNear] = useState('')
  const [pumpOn, setPumpOn] = useState('')
  const [testNotes, setTestNotes] = useState('')
  const connections = useRef(new Map<string, Connection>())
  const testTimeout = useRef<number | null>(null)
  const portsRef = useRef<PortState[]>([])

  useEffect(() => {
    portsRef.current = ports
  }, [ports])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  function updatePort(id: string, update: (port: PortState) => PortState) {
    setPorts((current) => current.map((port) => (port.id === id ? update(port) : port)))
  }

  function appendBytes(id: string, bytes: Uint8Array) {
    const connection = connections.current.get(id)
    const port = portsRef.current.find((candidate) => candidate.id === id)
    if (!connection || !port) return
    const now = Date.now()
    const raw = { time: now, delta: connection.previousRawTime == null ? null : now - connection.previousRawTime, bytes: bytes.slice() }
    connection.previousRawTime = now
    if (connection.paused) {
      updatePort(id, (current) => ({
        ...current,
        raw: [...current.raw, raw].slice(-500),
        byteCount: current.byteCount + bytes.length,
      }))
      return
    }
    const frames = connection.framer.push(bytes, now)
    const decoder = decoderById(port.config.decoder)
    const decoded = frames.map((frame): CapturedFrame => {
      const result = decoder.decode(frame, printedNumber)
      return {
        time: now,
        bytes: frame.slice(),
        eid15: result.eid15,
        decoder: result.campos.decodificador ?? decoder.id,
        warning: result.avisos.join('; '),
        ambiguous: result.avisos.includes('ambiguo'),
        dudosa: result.avisos.includes(AVISO_SUMA),
        wl134Confirmado: result.campos.formato === 'confirmado por suma de control',
        ...(result.campos.candidatoLE ? { candidateLE: result.campos.candidatoLE } : {}),
        ...(result.campos.candidatoBE ? { candidateBE: result.campos.candidatoBE } : {}),
      }
    })
    updatePort(id, (current) => {
      const countable = decoded.filter((frame) => frame.eid15 && !frame.ambiguous && !frame.warning.includes(AVISO_SUMA))
      const validTimes = [...current.validTimes, ...countable.map(() => now)].filter((at) => now - at <= 60_000)
      return {
        ...current,
        raw: [...current.raw, raw].slice(-500),
        frames: [...current.frames, ...decoded].slice(-500),
        byteCount: current.byteCount + bytes.length,
        frameCount: current.frameCount + frames.length,
        validCount: current.validCount + countable.length,
        validTimes,
        distinctEids: [...new Set([
          ...current.distinctEids,
          ...countable.flatMap((frame) => frame.eid15 ? [frame.eid15] : []),
        ])],
      }
    })
  }

  function ensureConnection(port: PortState) {
    let connection = connections.current.get(port.id)
    if (!connection) {
      connection = {
        framer: makeFramer(port),
        previousRawTime: null,
        paused: false,
        simulatedIndex: 0,
      }
      connections.current.set(port.id, connection)
    }
    return connection
  }

  function emitSimulatedFrame(id: string, connection: Connection) {
    const current = portsRef.current.find((candidate) => candidate.id === id)
    if (!current) return
    const eid = SAMPLE_EIDS[connection.simulatedIndex % SAMPLE_EIDS.length] ?? SAMPLE_EIDS[0]!
    connection.simulatedIndex++
    const noisy = current.config.simNoise && Math.random() < 0.25
    const chunk = noisy
      ? current.config.simFormat.startsWith('ascii')
        ? new TextEncoder().encode('??\r\n')
        : Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0])
      : makeFrame(eid, current.config.simFormat)
    appendBytes(id, chunk)
  }

  async function connectPort(port: PortState) {
    const connection = ensureConnection(port)
    if (port.source === 'simulado') {
      connection.framer = makeFramer(port)
      connection.paused = false
      updatePort(port.id, (current) => ({ ...current, connected: true, paused: false }))
      connection.timer = window.setInterval(() => emitSimulatedFrame(port.id, connection), port.config.simInterval)
      return
    }

    const serialPort = port.serialPort
    if (!serialPort) return
    try {
      await serialPort.open({
        baudRate: port.config.baudRate,
        dataBits: port.config.dataBits,
        stopBits: port.config.stopBits,
        parity: port.config.parity,
        flowControl: 'none',
      })
      connection.framer = makeFramer(port)
      updatePort(port.id, (current) => ({ ...current, connected: true, paused: false }))
      if (!serialPort.readable) throw new Error('El puerto no ofrece un flujo de lectura.')
      const reader = serialPort.readable.getReader()
      connection.reader = reader
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) appendBytes(port.id, value)
      }
    } catch (error) {
      setMessage(`No se pudo leer ${port.name}: ${error instanceof Error ? error.message : String(error)}`)
      updatePort(port.id, (current) => ({ ...current, connected: false }))
    } finally {
      connection.reader?.releaseLock()
      connection.reader = undefined
      try {
        await serialPort.close()
      } catch (error) {
        setMessage(`No se pudo cerrar ${port.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
      updatePort(port.id, (current) => ({ ...current, connected: false }))
    }
  }

  async function disconnectPort(port: PortState) {
    const connection = connections.current.get(port.id)
    if (connection?.timer != null) window.clearInterval(connection.timer)
    if (connection?.reader) {
      try {
        await connection.reader.cancel()
      } catch (error) {
        setMessage(`No se pudo detener la lectura de ${port.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
      return
    }
    if (port.source === 'serial' && port.serialPort) {
      try {
        await port.serialPort.close()
      } catch (error) {
        setMessage(`No se pudo cerrar ${port.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    updatePort(port.id, (current) => ({ ...current, connected: false }))
  }

  async function addReader() {
    if (!navigator.serial) {
      setMessage('Web Serial no está disponible en este navegador.')
      return
    }
    try {
      const serialPort = await navigator.serial.requestPort()
      const port = newPort('serial', serialPort)
      setPorts((current) => [...current, port])
      setSelectedRawId(port.id)
      setMessage('')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return
      setMessage(`No se pudo agregar el lector: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function reconnectAuthorized() {
    if (!navigator.serial) return
    try {
      const authorized = await navigator.serial.getPorts()
      const existing = new Set(portsRef.current.flatMap((port) => (port.serialPort ? [port.serialPort] : [])))
      const added = authorized.filter((port) => !existing.has(port)).map((port) => newPort('serial', port))
      setPorts((current) => [...current, ...added])
      setMessage(`${authorized.length} puerto(s) autorizado(s) disponibles.`)
    } catch (error) {
      setMessage(`No se pudieron reconectar los puertos: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function addSimulatedPort() {
    const port = newPort('simulado')
    setPorts((current) => [...current, port])
    setSelectedRawId(port.id)
    setMessage('')
  }

  function updateConfig(id: string, patch: Partial<PortState['config']>) {
    const existingPort = portsRef.current.find((port) => port.id === id)
    if (!existingPort) return
    const config = { ...existingPort.config, ...patch }
    if (existingPort.source === 'simulado' && patch.simFormat) {
      if (patch.simFormat.startsWith('ascii')) {
        config.framing = 'lineas'
        config.decoder = 'automatico'
      } else if (patch.simFormat.startsWith('wl134')) {
        config.framing = 'inicio-largo'
        config.frameLength = 30
        config.startHex = '02'
        config.endHex = '03'
        config.decoder = 'wl134'
      } else if (patch.simFormat.startsWith('fdxb')) {
        config.framing = 'fija'
        config.frameLength = 8
        config.decoder = patch.simFormat === 'fdxb-be' ? 'iso11784-8bytes-be-fdxb' : 'iso11784-8bytes-le-fdxb'
      } else {
        config.framing = 'fija'
        config.frameLength = 8
        config.decoder = patch.simFormat === 'iso-be' ? 'iso11784-8bytes-be' : 'iso11784-8bytes-le'
      }
    }
    const connection = connections.current.get(id)
    if (connection) {
      connection.framer = createFramer(config.framing, framerOptions(config))
      if (existingPort.source === 'simulado' && existingPort.connected && patch.simInterval != null && connection.timer != null) {
        window.clearInterval(connection.timer)
        connection.timer = window.setInterval(() => emitSimulatedFrame(id, connection), config.simInterval)
      }
    }
    updatePort(id, (port) => {
      return { ...port, config }
    })
  }

  function togglePause(port: PortState) {
    const connection = connections.current.get(port.id)
    if (connection) {
      connection.paused = !port.paused
      if (!port.paused) connection.framer.reset()
    }
    updatePort(port.id, (current) => ({ ...current, paused: !current.paused }))
  }

  function clearPort(port: PortState) {
    const connection = connections.current.get(port.id)
    connection?.framer.reset()
    if (connection) connection.previousRawTime = null
    updatePort(port.id, (current) => ({
      ...current,
      raw: [],
      frames: [],
      byteCount: 0,
      frameCount: 0,
      validCount: 0,
      validTimes: [],
      distinctEids: [],
    }))
  }

  function downloadRaw(port: PortState) {
    const lines = port.raw.map(rawLine)
    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${port.name.replace(/[^a-z0-9-_]/gi, '-')}-captura.txt`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function copyRaw(port: PortState) {
    const text = port.raw.map(rawLine).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setMessage('Vista cruda copiada.')
    } catch (error) {
      setMessage(`No se pudo copiar: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  useEffect(() => {
    if (!navigator.serial) return
    void navigator.serial.getPorts().then((authorized) => {
      if (authorized.length > 0) setMessage(`Hay ${authorized.length} puerto(s) autorizado(s). Podés usar "Reconectar puertos autorizados".`)
    }).catch((error: unknown) => {
      setMessage(`No se pudieron consultar los puertos autorizados: ${error instanceof Error ? error.message : String(error)}`)
    })
    const onDisconnect = (event: Event) => {
      const port = (event as SerialPortEvent).port
      const record = portsRef.current.find((candidate) => candidate.serialPort === port)
      if (!record) return
      const connection = connections.current.get(record.id)
      if (connection?.timer != null) window.clearInterval(connection.timer)
      updatePort(record.id, (current) => ({ ...current, connected: false }))
      setMessage(`${record.name} se desconectó.`)
    }
    navigator.serial.addEventListener('disconnect', onDisconnect)
    return () => navigator.serial?.removeEventListener('disconnect', onDisconnect)
  }, [])

  useEffect(() => () => {
    for (const connection of connections.current.values()) {
      if (connection.timer != null) window.clearInterval(connection.timer)
      void connection.reader?.cancel()
    }
    if (testTimeout.current != null) window.clearTimeout(testTimeout.current)
  }, [])

  const selectedRaw = ports.find((port) => port.id === selectedRawId)
  const selectedDetectivePort = ports.find((port) => port.id === detectivePortId)
  const selectedTestPort = ports.find((port) => port.id === testPortId)
  const allReadings = ports.flatMap((port, portIndex) => port.frames.map((frame) => {
    const decoder = decoderById(port.config.decoder)
    const result = decoder.decode(frame.bytes, printedNumber)
    return {
      ...frame,
      eid15: result.eid15,
      decoder: result.campos.decodificador ?? decoder.id,
      warning: result.avisos.join('; '),
      ambiguous: result.avisos.includes('ambiguo'),
      dudosa: result.avisos.includes(AVISO_SUMA),
      wl134Confirmado: result.campos.formato === 'confirmado por suma de control',
      candidateLE: result.campos.candidatoLE,
      candidateBE: result.campos.candidatoBE,
      portId: port.id,
      portName: port.name,
      portIndex,
    }
  })).sort((a, b) => b.time - a.time)

  function findPrintedNumber() {
    if (!selectedDetectivePort) return
    setFindResult(findNumberInFrames(
      selectedDetectivePort.frames.slice(-50).map((frame) => frame.bytes),
      printedNumber,
    ))
  }

  async function copySample(port: PortState) {
    const sample = [
      `Modelo: ${port.model}`,
      `Puerto: ${port.name}`,
      `Configuración serie: ${port.config.baudRate} baudios, ${port.config.dataBits} bits, paridad ${port.config.parity}, ${port.config.stopBits} bit(s) de parada`,
      `Tramado: ${port.config.framing}`,
      `Decodificador: ${port.config.decoder}`,
      `Número impreso: ${printedNumber || '(sin dato)'}`,
      '',
      ...port.frames.slice(-20).map((frame, index) =>
        `${index + 1}. ${bytesToHex(frame.bytes)} | ${bytesToAscii(frame.bytes)}`,
      ),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(sample)
      setMessage('Muestra copiada para compartir.')
    } catch (error) {
      setMessage(`No se pudo copiar la muestra: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function finishTimedTest(run: TimedRun) {
    const port = portsRef.current.find((candidate) => candidate.id === run.portId)
    if (!port) {
      setMessage('El puerto de la prueba ya no está disponible.')
      setTestRun(null)
      return
    }
    const frames = port.frames
      .filter((frame) => frame.time >= run.startedAt)
      .map((frame) => decoderById(port.config.decoder).decode(frame.bytes, run.printedNumber))
    const ambiguous = frames.filter((frame) => frame.avisos.includes('ambiguo')).length
    const valid = frames.filter((frame) => esLecturaValida(frame))
    const matched = valid.filter((frame) => matchTyped(run.printedNumber, frame.eid15 ?? '') === 'coincide').length
    const mismatched = valid.length - matched
    const result: TestResultado = valid.length === 0
      ? 'no_leyo'
      : matched === valid.length
        ? 'leyo_ok'
        : matched === 0
          ? 'leyo_mal'
          : 'parcial'
    setTestSummary({
      portId: run.portId,
      duration: run.duration,
      frames: frames.length,
      valid: valid.length,
      ambiguous,
      matched,
      mismatched,
      distinct: new Set(valid.flatMap((frame) => frame.eid15 ? [frame.eid15] : [])).size,
      perSecond: Math.round((valid.length / run.duration) * 100) / 100,
      result,
    })
    setTestRun(null)
    testTimeout.current = null
  }

  function startTimedTest() {
    if (!selectedTestPort?.connected) {
      setMessage('Conectá el puerto elegido antes de iniciar la prueba.')
      return
    }
    if (testTimeout.current != null) window.clearTimeout(testTimeout.current)
    const run = {
      portId: selectedTestPort.id,
      duration: testDuration,
      startedAt: Date.now(),
      printedNumber,
    }
    setClockNow(run.startedAt)
    setTestSummary(null)
    setTestRun(run)
    testTimeout.current = window.setTimeout(() => finishTimedTest(run), run.duration * 1000)
  }

  function saveTimedTest() {
    if (!testSummary) return
    const port = portsRef.current.find((candidate) => candidate.id === testSummary.portId)
    if (!port) {
      setMessage('No se puede guardar: el puerto de la prueba no está disponible.')
      return
    }
    const distance = distanceCm.trim() ? Number(distanceCm) : undefined
    const sample = port.frames.slice(-20).map((frame) => bytesToHex(frame.bytes)).join('\n')
    const saved = addTest({
      modeloLector: port.model,
      puerto: port.name,
      ...(distance != null && Number.isFinite(distance) ? { distanciaCm: distance } : {}),
      ...(testPlace ? { lugar: testPlace } : {}),
      ...(metalNear ? { metalCerca: metalNear === 'si' } : {}),
      ...(pumpOn ? { bombaEncendida: pumpOn === 'si' } : {}),
      ...(printedNumber ? { numeroImpreso: printedNumber } : {}),
      resultado: testSummary.result,
      lecturas: testSummary.valid,
      duracionSeg: testSummary.duration,
      notas: testNotes,
      muestra: sample,
    })
    setTestStorage({ tests: saved.tests, notice: saved.notice })
    setMessage(saved.notice ?? 'Prueba guardada en este navegador.')
  }

  function removeTest(id: string) {
    if (!window.confirm('¿Borrar esta prueba del registro local?')) return
    const deleted = deleteTest(id)
    setTestStorage({ tests: deleted.tests, notice: deleted.notice })
    if (deleted.notice) setMessage(deleted.notice)
  }

  function exportTests() {
    const blob = new Blob([testsToCsv(testRecords)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'pruebas-laboratorio-lectores.csv'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="space-y-5">
      {!navigator.serial && (
        <Card title="Compatibilidad">
          <p className="text-sm text-ink-muted">
            El laboratorio necesita Chrome o Edge de escritorio y abrirse por HTTPS o localhost para usar lectores físicos. En este navegador solo queda disponible el puerto simulado.
          </p>
        </Card>
      )}

      {(message || testStorage.notice) && (
        <Card className="border-accent-text/30 bg-accent-soft">
          <p role="status" className="text-sm text-accent-text">{message || testStorage.notice}</p>
        </Card>
      )}

      <Card title="Puertos" action={<div className="flex flex-wrap gap-2">
        {navigator.serial && <Button variant="secondary" onClick={() => void addReader()}>Agregar lector</Button>}
        <Button variant="secondary" onClick={addSimulatedPort}>Agregar puerto simulado</Button>
        {navigator.serial && <Button variant="ghost" onClick={() => void reconnectAuthorized()}>Reconectar puertos autorizados</Button>}
      </div>}>
        {ports.length === 0 ? <EmptyState>Agregá un lector o un puerto simulado para empezar.</EmptyState> : (
          <div className="space-y-5">
            {ports.map((port, index) => {
              const latest = allReadings.find((reading) => reading.portId === port.id && reading.eid15 && !reading.ambiguous && !reading.dudosa)
              const portReadings = allReadings.filter((reading) => reading.portId === port.id)
              const validReadings = portReadings.filter((reading) => reading.eid15 && !reading.ambiguous && !reading.dudosa)
              const ambiguousCount = portReadings.filter((reading) => reading.ambiguous).length
              const distinct = new Set(validReadings.flatMap((reading) => reading.eid15 ? [reading.eid15] : [])).size
              const rpm = validReadings.filter((reading) => clockNow - reading.time <= 60_000).length
              return (
                <section key={port.id} className="rounded-xl border border-line p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-3 w-3 rounded-full ${PORT_COLORS[index % PORT_COLORS.length]?.split(' ')[0]}`} />
                      <input aria-label="Nombre del puerto" className="w-36 rounded border border-line bg-surface px-2 py-1 font-semibold text-ink" value={port.name} onChange={(event) => updatePort(port.id, (current) => ({ ...current, name: event.target.value }))} />
                      <Badge tone={port.connected ? 'ok' : 'neutral'}>{port.connected ? 'Conectado' : 'Desconectado'}</Badge>
                      {port.source === 'simulado' && <Badge tone="info">Simulado</Badge>}
                    </div>
                    <div className="flex gap-2">
                      {port.connected
                        ? <Button variant="secondary" onClick={() => void disconnectPort(port)}>Desconectar</Button>
                        : <Button onClick={() => void connectPort(port)}>Conectar</Button>}
                      <Button variant="ghost" onClick={() => togglePause(port)} disabled={!port.connected}>{port.paused ? 'Reanudar' : 'Pausar'}</Button>
                      <Button variant="ghost" onClick={() => clearPort(port)}>Limpiar</Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SelectField label="Modelo" value={port.model} onChange={(event) => {
                      const model = event.target.value as Model
                      updatePort(port.id, (current) => ({ ...current, model }))
                      if (model === 'WL-134') {
                        updateConfig(port.id, {
                          baudRate: 9600,
                          dataBits: 8,
                          stopBits: 1,
                          parity: 'none',
                          framing: 'inicio-largo',
                          frameLength: 30,
                          startHex: '02',
                          endHex: '03',
                          decoder: 'wl134',
                        })
                      }
                    }}>
                      <option>WL-134</option><option>ZOCORFID</option><option>Otro</option>
                    </SelectField>
                    <SelectField label="Baudios" value={port.config.baudRate} disabled={port.source === 'serial' && port.connected} onChange={(event) => updateConfig(port.id, { baudRate: Number(event.target.value) })}>
                      {[4800, 9600, 19200, 38400, 57600, 115200].map((speed) => <option key={speed} value={speed}>{speed}</option>)}
                    </SelectField>
                    <SelectField label="Bits de datos" value={port.config.dataBits} disabled={port.source === 'serial' && port.connected} onChange={(event) => updateConfig(port.id, { dataBits: Number(event.target.value) as 7 | 8 })}>
                      <option value={7}>7</option><option value={8}>8</option>
                    </SelectField>
                    <SelectField label="Paridad" value={port.config.parity} disabled={port.source === 'serial' && port.connected} onChange={(event) => updateConfig(port.id, { parity: event.target.value as PortState['config']['parity'] })}>
                      <option value="none">Sin paridad</option><option value="even">Par</option><option value="odd">Impar</option>
                    </SelectField>
                    <SelectField label="Bits de parada" value={port.config.stopBits} disabled={port.source === 'serial' && port.connected} onChange={(event) => updateConfig(port.id, { stopBits: Number(event.target.value) as 1 | 2 })}>
                      <option value={1}>1</option><option value={2}>2</option>
                    </SelectField>
                    <SelectField label="Tramado" value={port.config.framing} onChange={(event) => updateConfig(port.id, { framing: event.target.value as FramingKind })}>
                      <option value="lineas">Por líneas</option><option value="silencio">Por silencio</option><option value="fija">Longitud fija</option><option value="inicio-fin">Inicio y fin</option><option value="inicio-largo">Inicio y largo fijo</option>
                    </SelectField>
                    {port.config.framing === 'silencio' && <Field label="Silencio (ms)" type="number" min={1} value={port.config.silenceMs} onChange={(event) => updateConfig(port.id, { silenceMs: Math.max(1, Number(event.target.value) || 1) })} />}
                    {port.config.framing === 'fija' && <Field label="Longitud (bytes)" type="number" min={1} value={port.config.frameLength} onChange={(event) => updateConfig(port.id, { frameLength: Math.max(1, Number(event.target.value) || 1) })} />}
                    {port.config.framing === 'inicio-fin' && <>
                      <Field label="Inicio (hex)" value={port.config.startHex} onChange={(event) => updateConfig(port.id, { startHex: event.target.value })} />
                      <Field label="Fin (hex)" value={port.config.endHex} onChange={(event) => updateConfig(port.id, { endHex: event.target.value })} />
                      <p className="sm:col-span-2 text-xs text-ink-muted">Si la suma de control puede valer 0x02 o 0x03, este recorte puede cortar mal la trama. Preferí inicio y largo fijo.</p>
                    </>}
                    {port.config.framing === 'inicio-largo' && <>
                      <Field label="Inicio (hex)" value={port.config.startHex} onChange={(event) => updateConfig(port.id, { startHex: event.target.value })} />
                      <Field label="Largo (bytes)" type="number" min={1} value={port.config.frameLength} onChange={(event) => updateConfig(port.id, { frameLength: Math.max(1, Number(event.target.value) || 1) })} />
                      <Field label="Fin (hex, opcional)" value={port.config.endHex} onChange={(event) => updateConfig(port.id, { endHex: event.target.value })} />
                    </>}
                    <div className="flex items-end">
                      <Button variant="secondary" onClick={() => updateConfig(port.id, {
                        baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none',
                        framing: 'inicio-largo', frameLength: 30, startHex: '02', endHex: '03', decoder: 'wl134',
                      })}>Usar formato publicado del WL-134</Button>
                    </div>
                    <SelectField label="Decodificador" value={port.config.decoder} onChange={(event) => updateConfig(port.id, { decoder: event.target.value })}>
                      {DECODERS.map((decoder) => <option key={decoder.id} value={decoder.id}>{decoder.nombre}</option>)}
                    </SelectField>
                    {port.source === 'simulado' && <>
                      <SelectField label="Formato simulado" value={port.config.simFormat} onChange={(event) => updateConfig(port.id, { simFormat: event.target.value as SimFormat })}>
                        <option value="ascii-separador">ASCII con separador</option>
                        <option value="ascii-15">ASCII 15 dígitos</option>
                        <option value="iso-le">ISO 11784 · tabla · LE</option>
                        <option value="iso-be">ISO 11784 · tabla · BE</option>
                        <option value="fdxb-le">FDX-B · nacional primero · LE</option>
                        <option value="fdxb-be">FDX-B · nacional primero · BE</option>
                        <option value="wl134">WL-134 (suma correcta)</option>
                        <option value="wl134-suma-mala">WL-134 (suma incorrecta)</option>
                      </SelectField>
                      <Field label="Intervalo (s)" type="number" min={0.5} max={5} step={0.5} value={port.config.simInterval / 1000} onChange={(event) => updateConfig(port.id, { simInterval: Math.max(500, Math.min(5000, (Number(event.target.value) || 0.5) * 1000)) })} />
                      <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-ink"><input type="checkbox" checked={port.config.simNoise} onChange={(event) => updateConfig(port.id, { simNoise: event.target.checked })} /> Ruido ocasional</label>
                    </>}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Stat title="Bytes recibidos" value={port.byteCount} />
                    <Stat title="Tramas" value={port.frameCount} />
                    <Stat title="Lecturas válidas" value={validReadings.length} />
                    <Stat title="Ambiguas" value={ambiguousCount} />
                    <Stat title="Caravanas distintas" value={distinct} />
                    <Stat title="Lecturas por minuto" value={rpm} />
                  </div>
                  <Card title="Última lectura" className="bg-subtle/50">
                    {latest ? (
                      <div>
                        <p className="font-mono text-lg font-bold text-ink">{latest.eid15?.replace(/^(\d{3})(\d{12})$/, '$1 $2')}</p>
                        <p className="mt-1 text-sm text-ink-muted">País: {latest.eid15?.slice(0, 3)} · Nacional: {latest.eid15?.slice(3)} · Visual: {latest.eid15?.slice(-10)}</p>
                        <p className="mt-1 text-xs text-ink-muted">Decodificador: {latest.decoder}</p>
                      </div>
                    ) : <EmptyState>Todavía no hay una lectura válida.</EmptyState>}
                  </Card>
                </section>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="Vista cruda" action={<div className="flex gap-2">
        <SelectField label="Puerto" className="min-w-40" value={selectedRawId} onChange={(event) => setSelectedRawId(event.target.value)}>
          <option value="">Elegir puerto</option>{ports.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}
        </SelectField>
        <Button variant="secondary" disabled={!selectedRaw} onClick={() => selectedRaw && void copyRaw(selectedRaw)}>Copiar</Button>
        <Button variant="secondary" disabled={!selectedRaw} onClick={() => selectedRaw && downloadRaw(selectedRaw)}>Descargar .txt</Button>
      </div>}>
        {!selectedRaw || selectedRaw.raw.length === 0 ? <EmptyState>Las últimas recepciones aparecerán aquí.</EmptyState> : (
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-line bg-subtle p-3 font-mono text-xs">
            {[...selectedRaw.raw].reverse().map((entry, index) => (
              <div key={`${entry.time}-${index}`} className="grid gap-2 border-b border-line py-1 sm:grid-cols-[10rem_7rem_5rem_1fr_1fr]">
                <span>{timeLabel(entry.time)}</span><span>{entry.delta == null ? '— ms' : `+${entry.delta} ms`}</span><span>{entry.bytes.length} bytes</span>
                <span className="break-all">{bytesToHex(entry.bytes)}</span><span className="break-all">{bytesToAscii(entry.bytes)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Número impreso y detective de formato">
        <div className="grid gap-3 sm:grid-cols-[minmax(16rem,1fr)_minmax(12rem,0.6fr)_auto] sm:items-end">
          <Field
            label="Número impreso de la caravana"
            value={printedNumber}
            onChange={(event) => setPrintedNumber(event.target.value)}
            placeholder="10, 12 o 15 dígitos"
            hint="Se aceptan espacios, guiones y guiones bajos."
          />
          <SelectField label="Puerto para buscar" value={detectivePortId} onChange={(event) => setDetectivePortId(event.target.value)}>
            <option value="">Elegir puerto</option>{ports.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}
          </SelectField>
          <Button onClick={findPrintedNumber} disabled={!selectedDetectivePort || !printedNumber}>Buscar este número en los bytes capturados</Button>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Si aparece en ASCII, elegí el decodificador por dígitos; si aparece como 8 bytes, elegí ISO 11784 y probá los dos órdenes.
        </p>
        {selectedDetectivePort && (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => void copySample(selectedDetectivePort)}>Copiar muestra para el otro chat</Button>
          </div>
        )}
        {findResult && (
          <div className="mt-4 space-y-2">
            {findResult.hallazgos.length === 0 ? (
              <p role="status" className="rounded-lg bg-accent-soft p-3 text-sm text-accent-text">
                No se encontró. Revisá la velocidad en baudios, el tramado y el número tipeado.
                {findResult.motivo ? ` ${findResult.motivo}` : ''}
              </p>
            ) : findResult.hallazgos.map((hit, index) => {
              const frame = selectedDetectivePort?.frames.slice(-50)[hit.indiceTrama]
              return (
                <div key={`${hit.codificacion}-${hit.indiceTrama}-${hit.desplazamiento}-${index}`} className="rounded-lg border border-line p-3 text-sm">
                  <p className="font-semibold text-ink">{hit.codificacion} · trama {hit.indiceTrama + 1} · posición {hit.desplazamiento}</p>
                  {frame && <HighlightedBytes bytes={frame.bytes} start={hit.desplazamiento} length={hit.longitud} />}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="Lecturas decodificadas">
        {allReadings.length === 0 ? <EmptyState>Las lecturas de todos los puertos aparecerán aquí, de la más reciente a la más antigua.</EmptyState> : (
          <div className="max-h-[36rem] space-y-2 overflow-auto">
            {allReadings.slice(0, 500).map((reading, index) => {
              const countable = Boolean(reading.eid15) && !reading.ambiguous && !reading.dudosa
              const duplicate = countable && reading.eid15 != null && allReadings.some((other) =>
                other.portId !== reading.portId && other.eid15 === reading.eid15 && !other.ambiguous && !other.dudosa && Math.abs(other.time - reading.time) < 2000,
              )
              const typed = normalizeTyped(printedNumber)
              const match = countable && reading.eid15 && printedNumber
                ? matchTyped(typed, reading.eid15)
                : 'formato_no_reconocido'
              const resultChip = reading.ambiguous
                ? <Badge tone="warn">Orden ambiguo</Badge>
                : reading.dudosa
                  ? <Badge tone="warn">Suma de control no coincide</Badge>
                  : match === 'coincide'
                    ? <Badge tone="ok">Coincide</Badge>
                    : match === 'no_coincide'
                      ? <Badge tone="danger">No coincide</Badge>
                      : <Badge tone="neutral">Sin dato</Badge>
              return (
                <div key={`${reading.portId}-${reading.time}-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PORT_COLORS[reading.portIndex % PORT_COLORS.length]}`}>{reading.portName}</span>
                  <span className="min-w-48 font-mono font-semibold text-ink">{reading.eid15 ? reading.eid15.replace(/^(\d{3})(\d{12})$/, '$1 $2') : 'Ilegible'}</span>
                  {duplicate && <Badge tone="warn">Doble lectura</Badge>}
                  {reading.wl134Confirmado && <Badge tone="ok">Formato WL-134 confirmado</Badge>}
                  {resultChip}
                  {reading.ambiguous && (
                    <span className="w-full pl-2 text-xs text-ink-muted">
                      LE tabla: <span className="font-mono">{reading.candidateLE ?? '—'}</span>
                      {' · '}BE tabla: <span className="font-mono">{reading.candidateBE ?? '—'}</span>
                    </span>
                  )}
                  {(!reading.eid15 || reading.dudosa) && <span className="text-sm text-ink-muted">{reading.warning || 'Sin aviso del decodificador.'}</span>}
                  <time className="ml-auto text-xs text-ink-muted">{timeLabel(reading.time)}</time>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="Prueba cronometrada">
        <div className="grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_12rem_auto] sm:items-end">
          <SelectField label="Puerto" value={testPortId} onChange={(event) => setTestPortId(event.target.value)}>
            <option value="">Elegir puerto</option>{ports.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}
          </SelectField>
          <SelectField label="Duración" value={testDuration} onChange={(event) => setTestDuration(Number(event.target.value))}>
            <option value={10}>10 segundos</option><option value={30}>30 segundos</option><option value={60}>60 segundos</option>
          </SelectField>
          <Button onClick={startTimedTest} disabled={!selectedTestPort?.connected || testRun != null}>Empezar prueba</Button>
        </div>
        {testRun && (
          <p role="status" className="mt-3 rounded-lg bg-accent-soft p-3 text-sm font-semibold text-accent-text">
            Prueba en curso con {ports.find((port) => port.id === testRun.portId)?.name}: {Math.max(0, Math.ceil((testRun.startedAt + testRun.duration * 1000 - clockNow) / 1000))} segundos restantes.
          </p>
        )}
        {testSummary && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat title="Tramas" value={testSummary.frames} />
              <Stat title="Lecturas válidas" value={testSummary.valid} />
              <Stat title="Ambiguas" value={testSummary.ambiguous} />
              <Stat title="Coinciden" value={testSummary.matched} />
              <Stat title="No coinciden" value={testSummary.mismatched} />
              <Stat title="Caravanas distintas" value={testSummary.distinct} />
              <Stat title="Lecturas por segundo" value={testSummary.perSecond} />
            </div>
            <p className="text-sm text-ink-muted">Coinciden: {testSummary.matched} · No coinciden: {testSummary.mismatched}</p>
            <Badge tone={testSummary.result === 'leyo_ok' ? 'ok' : testSummary.result === 'parcial' ? 'warn' : testSummary.result === 'leyo_mal' ? 'danger' : 'neutral'}>
              Resultado sugerido: {testSummary.result}
            </Badge>
            {testSummary.ambiguous > 0 && (
              <p role="alert" className="rounded-lg bg-accent-soft p-3 text-sm font-semibold text-accent-text">
                Hay {testSummary.ambiguous} lectura(s) ambigua(s). Elegí el decodificador o tipeá el número impreso para resolverlas.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Distancia (cm)" type="number" min={0} value={distanceCm} onChange={(event) => setDistanceCm(event.target.value)} />
              <Field label="Lugar" value={testPlace} onChange={(event) => setTestPlace(event.target.value)} />
              <SelectField label="Metal cerca" value={metalNear} onChange={(event) => setMetalNear(event.target.value)}>
                <option value="">Sin dato</option><option value="si">Sí</option><option value="no">No</option>
              </SelectField>
              <SelectField label="Bomba de vacío encendida" value={pumpOn} onChange={(event) => setPumpOn(event.target.value)}>
                <option value="">Sin dato</option><option value="si">Sí</option><option value="no">No</option>
              </SelectField>
              <Field label="Número impreso" value={printedNumber} onChange={(event) => setPrintedNumber(event.target.value)} />
              <Field label="Notas" value={testNotes} onChange={(event) => setTestNotes(event.target.value)} />
            </div>
            <Button onClick={saveTimedTest}>Guardar prueba</Button>
          </div>
        )}
      </Card>

      <Card title="Registro de pruebas" action={<Button variant="secondary" onClick={exportTests} disabled={testRecords.length === 0}>Exportar CSV</Button>}>
        {testRecords.length === 0 ? <EmptyState>No hay pruebas guardadas en este navegador.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-line text-ink-muted">
                <th className="p-2">Fecha y hora</th><th className="p-2">Lector / puerto</th><th className="p-2">Distancia</th><th className="p-2">Resultado</th><th className="p-2">Lecturas</th><th className="p-2">Notas</th><th className="p-2">Acción</th>
              </tr></thead>
              <tbody>{testRecords.map((record) => (
                <tr key={record.id} className="border-b border-line">
                  <td className="p-2">{new Date(record.fechaHora).toLocaleString('es-AR')}</td>
                  <td className="p-2">{record.modeloLector} · {record.puerto}</td>
                  <td className="p-2">{record.distanciaCm == null ? '—' : `${record.distanciaCm} cm`}</td>
                  <td className="p-2">{record.resultado}</td>
                  <td className="p-2">{record.lecturas}</td>
                  <td className="max-w-52 truncate p-2">{record.notas || '—'}</td>
                  <td className="p-2"><Button variant="danger" className="min-h-8 px-2" onClick={() => removeTest(record.id)}>Borrar</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({ title, value }: { title: string; value: number }) {
  return <div className="rounded-lg bg-subtle p-3"><p className="text-xs font-semibold text-ink-muted">{title}</p><p className="mt-1 text-xl font-bold text-ink">{value}</p></div>
}

function HighlightedBytes({ bytes, start, length }: { bytes: Uint8Array; start: number; length: number }) {
  return (
    <p className="mt-2 break-all font-mono text-xs text-ink-muted">
      {Array.from(bytes, (byte, index) => (
        <span key={index} className={index >= start && index < start + length ? 'rounded bg-accent px-0.5 text-ink' : ''}>
          {byte.toString(16).padStart(2, '0').toUpperCase()}{index < bytes.length - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  )
}
