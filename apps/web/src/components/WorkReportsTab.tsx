import { useEffect, useState } from 'react'
import {
  api,
  photoFileUrl,
  type PartInstanceItem,
  type WorkReportItem,
  type WorkReportMeasurement,
} from '../lib/api'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, TextareaField, inputClass } from './ui'

const ROLE_LABEL: Record<string, string> = {
  TECNICO: 'Técnico',
  TAMBERO: 'Tambero',
  DUENIO: 'Dueño',
  ADMIN: 'Admin',
}

const INSTALL_CHIPS = [
  { key: 'today', label: 'Hoy', days: 0, approx: false },
  { key: '1w', label: 'Hace 1 semana', days: 7, approx: true },
  { key: '1m', label: 'Hace 1 mes', days: 30, approx: true },
  { key: '3m', label: 'Hace 3 meses', days: 91, approx: true },
] as const

function resolveChip(key: string, other: string): { date: Date; approx: boolean } | null {
  if (key === 'other') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(other.trim())
    if (!m) return null
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
    return { date, approx: false }
  }
  const preset = INSTALL_CHIPS.find((c) => c.key === key)
  if (!preset) return null
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - preset.days)
  return { date, approx: preset.approx }
}

function dueRank(p: PartInstanceItem) {
  if (p.life?.kind === 'USAGE_BASED' && p.life.status === 'OVERDUE') return 0
  if (p.life?.kind === 'USAGE_BASED' && p.life.status === 'SOON') return 1
  return 2
}

export function WorkReportEditor({
  token,
  tamboId,
  serviceRequestId,
  parts,
  onChanged,
}: {
  token: string
  tamboId: string
  serviceRequestId: string
  parts: PartInstanceItem[]
  onChanged?: () => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<WorkReportItem | null>(null)
  const [summary, setSummary] = useState('')
  const [taskDraft, setTaskDraft] = useState('')
  const [tasks, setTasks] = useState<string[]>([])
  const [hours, setHours] = useState('')
  const [measurements, setMeasurements] = useState<WorkReportMeasurement[]>([])
  const [mLabel, setMLabel] = useState('')
  const [mValue, setMValue] = useState('')
  const [mUnit, setMUnit] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [chip, setChip] = useState('today')
  const [other, setOther] = useState('')

  const readOnly = report?.status === 'SUBMITTED'
  const sorted = [...parts].sort((a, b) => dueRank(a) - dueRank(b))

  function apply(item: WorkReportItem) {
    setReport(item)
    setSummary(item.summary)
    setTasks(item.tasks)
    setHours(item.hoursWorked != null ? String(item.hoursWorked) : '')
    setMeasurements(item.measurements)
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setBusy(true)
        setError('')
        const res = await api.createWorkReport(token, { tamboId, serviceRequestId })
        if (!cancelled) apply(res.item)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo abrir el informe')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [serviceRequestId, tamboId, token])

  async function save() {
    if (!report || readOnly) return report
    const hoursWorked = hours.trim() === '' ? null : Number(hours.replace(',', '.'))
    if (hours.trim() !== '' && (!Number.isFinite(hoursWorked) || hoursWorked! < 0 || hoursWorked! > 100)) {
      throw new Error('Las horas tienen que estar entre 0 y 100.')
    }
    const res = await api.patchWorkReport(token, report.id, {
      summary,
      tasks,
      hoursWorked,
      measurements,
      photoUrls: report.photoUrls,
    })
    apply(res.item)
    return res.item
  }

  async function onPhoto(file: File | undefined) {
    if (!file || !report || readOnly) return
    if ((report.photoUrls?.length ?? 0) >= 6) {
      setError('Como máximo 6 fotos.')
      return
    }
    try {
      setBusy(true)
      await save()
      const { url } = await api.uploadPhoto(token, file)
      const res = await api.patchWorkReport(token, report.id, {
        photoUrls: [...report.photoUrls, url].slice(0, 6),
      })
      apply(res.item)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto')
    } finally {
      setBusy(false)
    }
  }

  async function registerParts() {
    if (!report || readOnly) return
    const instanceIds = Object.entries(selected)
      .filter(([, on]) => on)
      .map(([id]) => id)
    const installed = resolveChip(chip, other)
    if (instanceIds.length === 0) {
      setError('Elegí al menos una pieza.')
      return
    }
    if (!installed) {
      setError('Elegí cuándo se instalaron.')
      return
    }
    try {
      setBusy(true)
      setError('')
      await save()
      const res = await api.replaceWorkReportParts(token, report.id, {
        instanceIds,
        installedAt: installed.date.toISOString(),
        installedAtApprox: installed.approx,
      })
      apply(res.item)
      setSelected({})
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cambiar las piezas')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!report || readOnly) return
    if (!window.confirm('Después de enviarlo no se puede editar.')) return
    try {
      setBusy(true)
      setError('')
      await save()
      const res = await api.submitWorkReport(token, report.id)
      apply(res.item)
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el informe')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <p className="text-sm text-ink-muted">
        {report?.status === 'SUBMITTED' ? 'Informe enviado. Ya no se puede editar.' : 'Borrador del informe de este pedido.'}
      </p>
      <TextareaField
        label="Resumen"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        disabled={readOnly || busy}
        rows={3}
      />
      <div>
        <p className="text-sm font-semibold text-ink mb-1">Tareas</p>
        <ul className="space-y-1 mb-2">
          {tasks.map((t, i) => (
            <li key={`${t}-${i}`} className="flex items-center justify-between gap-2 text-sm text-ink">
              <span>{t}</span>
              {readOnly ? null : (
                <Button variant="ghost" onClick={() => setTasks((prev) => prev.filter((_, idx) => idx !== i))}>
                  Quitar
                </Button>
              )}
            </li>
          ))}
        </ul>
        {readOnly ? null : (
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              placeholder="Nueva tarea"
            />
            <Button
              variant="secondary"
              onClick={() => {
                if (!taskDraft.trim()) return
                setTasks((prev) => [...prev, taskDraft.trim().slice(0, 200)])
                setTaskDraft('')
              }}
            >
              Agregar
            </Button>
          </div>
        )}
      </div>
      <Field
        label="Horas"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        disabled={readOnly || busy}
        placeholder="Opcional"
      />
      <div>
        <p className="text-sm font-semibold text-ink mb-1">Mediciones</p>
        <ul className="space-y-1 mb-2 text-sm text-ink">
          {measurements.map((m, i) => (
            <li key={`${m.label}-${i}`} className="flex justify-between gap-2">
              <span>
                {m.label}: {m.value}
                {m.unit ? ` ${m.unit}` : ''}
              </span>
              {readOnly ? null : (
                <Button variant="ghost" onClick={() => setMeasurements((prev) => prev.filter((_, idx) => idx !== i))}>
                  Quitar
                </Button>
              )}
            </li>
          ))}
        </ul>
        {readOnly ? null : (
          <div className="grid gap-2 sm:grid-cols-4">
            <input className={inputClass} value={mLabel} onChange={(e) => setMLabel(e.target.value)} placeholder="Nombre" />
            <input className={inputClass} value={mValue} onChange={(e) => setMValue(e.target.value)} placeholder="Valor" />
            <input className={inputClass} value={mUnit} onChange={(e) => setMUnit(e.target.value)} placeholder="Unidad" />
            <Button
              variant="secondary"
              onClick={() => {
                if (!mLabel.trim() || !mValue.trim()) return
                setMeasurements((prev) => [
                  ...prev,
                  { label: mLabel.trim(), value: mValue.trim(), ...(mUnit.trim() ? { unit: mUnit.trim() } : {}) },
                ])
                setMLabel('')
                setMValue('')
                setMUnit('')
              }}
            >
              Agregar
            </Button>
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink mb-1">Fotos</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(report?.photoUrls ?? []).map((url) => (
            <img key={url} src={photoFileUrl(token, url)} alt="" className="w-full max-h-40 rounded-lg border border-line object-cover" />
          ))}
        </div>
        {readOnly ? null : (
          <input
            className="mt-2 text-sm"
            type="file"
            accept="image/*"
            onChange={(e) => void onPhoto(e.target.files?.[0])}
          />
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink mb-1">Piezas cambiadas</p>
        {(report?.replacedParts ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">Todavía no hay cambios en este informe.</p>
        ) : (
          <ul className="text-sm text-ink space-y-1">
            {(report?.replacedParts ?? []).map((p) => (
              <li key={p.id}>
                {p.partTypeName}
                {p.label ? ` · ${p.label}` : ''}
                {p.bajadaNumber != null ? ` · bajada ${p.bajadaNumber}` : ''} ·{' '}
                {new Date(p.installedAt).toLocaleDateString('es-AR')}
              </li>
            ))}
          </ul>
        )}
      </div>
      {readOnly ? null : (
        <>
          <div className="space-y-2">
            {sorted.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={Boolean(selected[p.id])}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                />
                {p.partType.name}
                {p.label ? ` · ${p.label}` : ''}
                {p.bajadaNumber != null ? ` · bajada ${p.bajadaNumber}` : ''}
                {p.life?.kind === 'USAGE_BASED' && p.life.status === 'OVERDUE' ? ' · para cambiar' : ''}
                {p.life?.kind === 'USAGE_BASED' && p.life.status === 'SOON' ? ' · cambiar pronto' : ''}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {INSTALL_CHIPS.map((c) => (
              <Button key={c.key} variant={chip === c.key ? 'primary' : 'secondary'} onClick={() => setChip(c.key)}>
                {c.label}
              </Button>
            ))}
            <Button variant={chip === 'other' ? 'primary' : 'secondary'} onClick={() => setChip('other')}>
              Fecha
            </Button>
          </div>
          {chip === 'other' ? (
            <Field label="AAAA-MM-DD" value={other} onChange={(e) => setOther(e.target.value)} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void registerParts()}>
              Registrar cambio
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              Enviar informe
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export function WorkReportsTab({ auth }: { auth: { token: string } }) {
  const [tamboId, setTamboId] = useState('')
  const [tambos, setTambos] = useState<{ id: string; name: string }[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [items, setItems] = useState<WorkReportItem[]>([])
  const [selected, setSelected] = useState<WorkReportItem | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await api.getTambos(auth.token)
        if (cancelled) return
        const list = res.items ?? []
        setTambos(list)
        if (!tamboId && list[0]) setTamboId(list[0].id)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los tambos')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [auth.token, tamboId])

  useEffect(() => {
    if (!tamboId) return
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await api.getWorkReports(auth.token, tamboId, {
          ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
          ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
        })
        if (cancelled) return
        setItems(res.items)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los informes')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [auth.token, from, tamboId, to])

  async function openDetail(id: string) {
    try {
      setError('')
      const res = await api.getWorkReport(auth.token, id)
      setSelected(res.item)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el informe')
    }
  }

  const tamboName = tambos.find((t) => t.id === tamboId)?.name ?? ''

  return (
    <div className="space-y-6">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <Card title="Filtro" className="print-hide">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="block text-sm font-semibold text-ink mb-1">Tambo</span>
            <select className={inputClass} value={tamboId} onChange={(e) => setTamboId(e.target.value)}>
              {tambos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Field label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      <Card title="Informes" className="print-hide">
        {loading ? (
          <EmptyState>Cargando...</EmptyState>
        ) : items.length === 0 ? (
          <EmptyState>No hay informes en este período.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="w-full text-left border border-line rounded-lg p-4 hover:bg-subtle"
                  onClick={() => void openDetail(item.id)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">
                      {new Date(item.performedAt).toLocaleDateString('es-AR')} · {item.author?.name ?? 'Alguien'} ·{' '}
                      {ROLE_LABEL[item.authorRole] ?? item.authorRole}
                    </p>
                    <Badge tone={item.status === 'SUBMITTED' ? 'ok' : 'warn'}>
                      {item.status === 'SUBMITTED' ? 'Enviado' : 'Borrador'}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-muted mt-1">
                    {item.serviceRequestId ? 'Pedido de service' : 'Trabajo propio'} · {item.replacedPartsCount} piezas
                    cambiadas
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selected ? (
        <Card
          className="work-report-print"
          title="Detalle"
          action={
            <Button className="print-hide" variant="secondary" onClick={() => window.print()}>
              Imprimir / guardar como PDF
            </Button>
          }
        >
          <div className="print-only mb-4">
            <p className="text-lg font-bold text-ink">{tamboName}</p>
            <p className="text-sm text-ink-muted">
              {new Date(selected.performedAt).toLocaleDateString('es-AR')} · {selected.author?.name ?? ''} ·{' '}
              {ROLE_LABEL[selected.authorRole] ?? selected.authorRole}
            </p>
          </div>
          <div className="space-y-3 text-sm text-ink">
            <p>
              <span className="font-semibold">Tipo: </span>
              {selected.serviceRequestId ? 'Pedido de service' : 'Trabajo propio'}
            </p>
            {selected.summary ? <p>{selected.summary}</p> : null}
            {selected.tasks.length > 0 ? (
              <ul className="list-disc pl-5">
                {selected.tasks.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ) : null}
            {selected.hoursWorked != null ? <p>Horas: {selected.hoursWorked}</p> : null}
            {selected.measurements.length > 0 ? (
              <ul>
                {selected.measurements.map((m, i) => (
                  <li key={i}>
                    {m.label}: {m.value}
                    {m.unit ? ` ${m.unit}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            {selected.photoUrls.map((url) => (
              <img key={url} src={photoFileUrl(auth.token, url)} alt="" className="w-full max-h-64 rounded-lg border border-line object-cover" />
            ))}
            <div>
              <p className="font-semibold mb-1">Piezas cambiadas</p>
              <ul>
                {selected.replacedParts.map((p) => (
                  <li key={p.id}>
                    {p.partTypeName}
                    {p.label ? ` · ${p.label}` : ''}
                    {p.bajadaNumber != null ? ` · bajada ${p.bajadaNumber}` : ''} ·{' '}
                    {new Date(p.installedAt).toLocaleDateString('es-AR')}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
