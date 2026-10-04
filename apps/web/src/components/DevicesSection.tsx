import { useCallback, useEffect, useState } from 'react'
import { api, type DeviceItem, type DeviceKind } from '../lib/api'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SelectField } from './ui'

const KIND_LABEL: Record<DeviceKind, string> = {
  VACUUM_PUMP_SENSOR: 'Sensor de bomba de vacío',
  FLOW_METER: 'Caudalímetro',
  RFID_READER: 'Lector de caravanas',
}

const TOKEN_NOTICE = 'Cargá esta clave en el dispositivo. Esta pantalla no la va a volver a mostrar.'

function formatAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} h`
  return `${Math.round(hours / 24)} d`
}

function deviceStatus(item: DeviceItem): string {
  if (!item.lastSeenAt) return 'Esperando primer contacto'
  if (item.connected) return `Conectado · hace ${formatAgo(item.lastSeenAt)}`
  return `Sin señal desde ${new Date(item.lastSeenAt).toLocaleString('es-AR')}`
}

function statusTone(item: DeviceItem): 'ok' | 'warn' | 'neutral' {
  if (item.connected) return 'ok'
  if (!item.lastSeenAt) return 'warn'
  return 'neutral'
}

function needsBajada(kind: DeviceKind) {
  return kind === 'FLOW_METER' || kind === 'RFID_READER'
}

export function DevicesSection({ token, tamboId }: { token: string; tamboId: string }) {
  const [items, setItems] = useState<DeviceItem[]>([])
  const [canManage, setCanManage] = useState(false)
  const [bajadaCount, setBajadaCount] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [kind, setKind] = useState<DeviceKind>('VACUUM_PUMP_SENSOR')
  const [bajadaNumber, setBajadaNumber] = useState('1')
  const [label, setLabel] = useState('')
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true)
        setError('')
        const result = await api.getDevices(token, tamboId)
        setItems(result.items || [])
        setCanManage(Boolean(result.canManage))
        if (result.tambo?.bajadaCount) setBajadaCount(result.tambo.bajadaCount)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los dispositivos')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [token, tamboId],
  )

  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      void load(true)
    }, 10_000)
    return () => window.clearInterval(id)
  }, [load])

  const copyToken = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const install = async () => {
    try {
      setBusy(true)
      setError('')
      const bajada = needsBajada(kind) ? Number(bajadaNumber) : null
      if (needsBajada(kind) && (!Number.isInteger(bajada) || bajada! < 1 || bajada! > bajadaCount)) {
        setError(`La bajada tiene que estar entre 1 y ${bajadaCount}.`)
        return
      }
      const result = await api.createDevice(token, {
        tamboId,
        kind,
        bajadaNumber: bajada,
        label: label.trim() || null,
      })
      setRevealedToken(result.deviceToken)
      setShowForm(false)
      setLabel('')
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo instalar el dispositivo')
    } finally {
      setBusy(false)
    }
  }

  const rotate = async (id: string) => {
    if (!window.confirm('El dispositivo deja de funcionar hasta que le cargues la clave nueva')) return
    try {
      setBusy(true)
      setError('')
      const result = await api.rotateDeviceToken(token, id)
      setRevealedToken(result.deviceToken)
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la clave nueva')
    } finally {
      setBusy(false)
    }
  }

  const retire = async (id: string) => {
    if (!window.confirm('¿Retirar este dispositivo? Deja de aceptar datos.')) return
    try {
      setBusy(true)
      setError('')
      await api.retireDevice(token, id)
      if (revealedToken) setRevealedToken(null)
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo retirar el dispositivo')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Dispositivos"
      action={
        <Button variant="secondary" disabled={loading || busy} onClick={() => void load()}>
          Actualizar
        </Button>
      }
    >
      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      {revealedToken ? (
        <div className="mb-4 rounded-lg border border-line bg-subtle p-4 space-y-2">
          <p className="text-sm font-semibold text-ink break-all">{revealedToken}</p>
          <p className="text-sm text-ink-muted">{TOKEN_NOTICE}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copyToken(revealedToken)}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <Button variant="ghost" onClick={() => setRevealedToken(null)}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <EmptyState>Cargando dispositivos...</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>Todavía no hay dispositivos en este tambo.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="border border-line rounded-lg p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">{KIND_LABEL[item.kind]}</p>
                <Badge tone={statusTone(item)}>{deviceStatus(item)}</Badge>
              </div>
              <p className="text-sm text-ink-muted">
                {item.bajadaNumber != null ? `Bajada ${item.bajadaNumber}` : 'Nivel tambo'}
                {item.label ? ` · ${item.label}` : ''}
              </p>
              {canManage ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" disabled={busy} onClick={() => void rotate(item.id)}>
                    Nueva clave
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={() => void retire(item.id)}>
                    Retirar
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="mt-4 space-y-3">
          {showForm ? (
            <div className="space-y-3 border-t border-line pt-4">
              <SelectField
                label="Tipo"
                value={kind}
                onChange={(e) => setKind(e.target.value as DeviceKind)}
              >
                {(Object.keys(KIND_LABEL) as DeviceKind[]).map((value) => (
                  <option key={value} value={value}>
                    {KIND_LABEL[value]}
                  </option>
                ))}
              </SelectField>
              {needsBajada(kind) ? (
                <Field
                  label="Bajada"
                  type="number"
                  min={1}
                  max={bajadaCount}
                  value={bajadaNumber}
                  onChange={(e) => setBajadaNumber(e.target.value)}
                  hint={`De 1 a ${bajadaCount}`}
                />
              ) : null}
              <Field
                label="Etiqueta"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Opcional"
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void install()}>
                  Instalar
                </Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setShowForm(true)}>
              Instalar dispositivo
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  )
}
