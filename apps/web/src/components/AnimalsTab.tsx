import { useEffect, useMemo, useState } from 'react'
import { api, photoFileUrl } from '../lib/api'
import {
  ageText,
  eidDigits,
  formatDateOnly,
  formatDateTime,
  formatEid,
  formatLiters,
  localToday,
  naturalCompare,
} from '../lib/format'
import type { AuthToken } from '../types/auth'
import type { Animal, AnimalSummary, TimelineItem } from '../types/dashboard'
import { TamboPicker, useTamboId } from './TamboPicker'
import { Badge, Card, EmptyState, ErrorBanner, Field, StatCard, type BadgeTone } from './ui'

interface AnimalsTabProps {
  auth: AuthToken
}

type StatusFilter = 'all' | 'ACTIVE' | 'DRY'
type KindFilter = 'all' | TimelineItem['kind']

const KIND_CHIPS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'health', label: 'Sanidad' },
  { id: 'repro', label: 'Reproducción' },
  { id: 'transfer', label: 'Traslado' },
  { id: 'control', label: 'Control lechero' },
  { id: 'weight', label: 'Peso' },
  { id: 'photo', label: 'Foto' },
]

const KIND_LABEL: Record<string, string> = {
  health: 'Sanidad',
  repro: 'Reproducción',
  transfer: 'Traslado',
  control: 'Control lechero',
  weight: 'Peso',
  photo: 'Foto',
}

const HEALTH_LABEL: Record<string, string> = {
  MASTITIS: 'Mastitis',
  TREATMENT: 'Tratamiento',
  OTHER: 'Sanidad',
}

const REPRO_LABEL: Record<string, string> = {
  HEAT: 'Celo',
  SERVICE: 'Servicio',
  EXPECTED_CALVING: 'Parto estimado',
  CALVING: 'Parto',
  ABORTION: 'Aborto',
  OTHER: 'Reproducción',
}

const focusClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'

function matchesSearch(animal: Animal, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  if (animal.earTag.toLowerCase().includes(q.toLowerCase())) return true
  const digits = q.replace(/[\s\-_]/g, '')
  if (digits.length >= 4 && /^\d+$/.test(digits)) {
    const eid = eidDigits(animal.electronicId)
    if (eid && (eid === digits || eid.endsWith(digits))) return true
  }
  return false
}

function AnimalPhoto({
  src,
  alt,
  size,
  fallback,
  onOpen,
}: {
  src: string | null
  alt: string
  size: number
  fallback: string
  onOpen?: () => void
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setBroken(false)
  }, [src])
  const showImg = Boolean(src) && !broken
  const inner = showImg ? (
    <img
      src={src!}
      alt={alt}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="w-full h-full object-cover"
    />
  ) : (
    <span className="text-xs font-bold text-accent-text">{fallback}</span>
  )
  const className = `shrink-0 overflow-hidden bg-accent flex items-center justify-center ${focusClass}`
  if (onOpen && src && !broken) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`${className} min-h-11 min-w-11`}
        style={{ width: size, height: size, borderRadius: size > 48 ? 12 : 9999 }}
        aria-label="Abrir foto"
      >
        {inner}
      </button>
    )
  }
  return (
    <div
      className={className}
      style={{ width: size, height: size, borderRadius: size > 48 ? 12 : 9999 }}
      aria-hidden={showImg ? undefined : true}
    >
      {inner}
    </div>
  )
}

function tagFallback(earTag: string): string {
  const t = earTag.trim()
  return t.slice(-3) || '—'
}

function shortDate(iso: string | null | undefined): string {
  const full = formatDateOnly(iso)
  if (full === '—') return '—'
  return full.slice(0, 5)
}

function timelineBody(item: TimelineItem, token: string): { title: string; extra?: string; photo?: string } {
  if (item.kind === 'health') {
    const bits = [HEALTH_LABEL[item.type] ?? item.type]
    if (item.productName) bits.push(`Tratamiento: ${item.productName}`)
    else if (item.type === 'TREATMENT' && item.summary && item.summary !== item.type) {
      bits.push(`Tratamiento: ${item.summary}`)
    }
    if (item.milkWithdrawalUntil) {
      bits.push(`Retiro de leche hasta ${formatDateOnly(item.milkWithdrawalUntil)}`)
    }
    return { title: bits.join(' · ') }
  }
  if (item.kind === 'repro') {
    return { title: REPRO_LABEL[item.type] ?? item.type }
  }
  if (item.kind === 'transfer') {
    const [from, to] = item.summary.split(' → ')
    return { title: from && to ? `Pasó de ${from} a ${to}` : item.summary }
  }
  if (item.kind === 'control') {
    const liters = item.liters != null ? formatLiters(item.liters) : null
    const bajada = item.bajadaNumber
    if (bajada != null && liters != null) return { title: `Bajada ${bajada} · ${liters} L` }
    return { title: item.summary }
  }
  if (item.kind === 'weight') {
    return { title: item.summary }
  }
  if (item.kind === 'photo') {
    const label = item.type === 'CONSULT' ? 'Foto de consulta' : 'Foto de perfil'
    return { title: label, photo: item.photoUrl ? photoFileUrl(token, item.photoUrl) : undefined }
  }
  return { title: item.summary }
}

function monthTitle(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const raw = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function pregnancyCard(summary: AnimalSummary | null, today: string) {
  if (!summary) return { value: '—', detail: undefined as string | undefined }
  const p = summary.pregnancy
  const hasRepro = Boolean(p.servedAt || p.lastCalvingAt || p.lastAbortionAt)
  if (p.pregnant && p.servedAt) {
    const parts = [`Servicio ${shortDate(p.servedAt)}`]
    if (p.expectedCalvingAt) {
      const days = Math.round(
        (Date.parse(`${p.expectedCalvingAt.slice(0, 10)}T00:00:00.000Z`) -
          Date.parse(`${today}T00:00:00.000Z`)) /
          86400000,
      )
      const dayBit = Number.isFinite(days) ? ` (en ${days} días)` : ''
      parts.push(`parto estimado ${shortDate(p.expectedCalvingAt)}${dayBit}`)
    }
    return {
      value: 'Preñada, según el último servicio',
      detail: parts.join(' · '),
    }
  }
  if (hasRepro && (p.lastCalvingAt || p.lastAbortionAt)) {
    return { value: 'Vacía', detail: undefined }
  }
  return { value: '—', detail: undefined }
}

function controlDetail(summary: AnimalSummary | null): string | undefined {
  if (!summary?.lastControl) return undefined
  const last = summary.lastControl
  const prev = summary.previousControl
  const date = shortDate(last.performedAt)
  if (!prev || prev.liters === 0) return date
  const pct = ((last.liters - prev.liters) / prev.liters) * 100
  const signed = `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1).replace('.', ',')} %`
  return `${date} · ${signed} respecto del anterior`
}

function alertChip(code: string, daysDelta: number, date: string): { text: string; tone: BadgeTone } | null {
  if (code === 'DRY_OFF') return { text: `Para secar: parto en ${daysDelta} días`, tone: 'warn' }
  if (code === 'CALVING_SOON') return { text: `Parto próximo: en ${daysDelta} días`, tone: 'warn' }
  if (code === 'CALVING_OVERDUE') return { text: `Parto atrasado ${Math.abs(daysDelta)} días`, tone: 'danger' }
  if (code === 'PREGNANCY_CHECK') return { text: `Tacto pendiente: servicio hace ${daysDelta} días`, tone: 'info' }
  if (code === 'MILK_WITHDRAWAL') {
    return { text: `En retiro de leche hasta ${formatDateOnly(date)}`, tone: 'danger' }
  }
  return null
}

export function AnimalsTab({ auth }: AnimalsTabProps) {
  const { tamboId, setTamboId, ready, error, setError } = useTamboId(auth.token)
  const [animals, setAnimals] = useState<Animal[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [summary, setSummary] = useState<AnimalSummary | null>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingFicha, setLoadingFicha] = useState(false)
  const [fichaError, setFichaError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const today = localToday()

  useEffect(() => {
    if (!ready) return
    if (!tamboId) {
      setAnimals([])
      setSelectedId(null)
      setSummary(null)
      setTimeline([])
      setQuery('')
      setLoading(false)
      return
    }

    let cancelled = false
    const fetchAnimals = async () => {
      try {
        setLoading(true)
        setError('')
        const result = await api.getAnimals(auth.token, tamboId)
        if (cancelled) return
        setAnimals(result.items || [])
        setSelectedId(null)
        setSummary(null)
        setTimeline([])
        setQuery('')
        setStatusFilter('all')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Error al cargar animales')
        setAnimals([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchAnimals()
    return () => {
      cancelled = true
    }
  }, [auth.token, tamboId, ready, setError])

  const sorted = useMemo(
    () => [...animals].sort((a, b) => naturalCompare(a.earTag, b.earTag)),
    [animals],
  )

  const counts = useMemo(() => {
    const milking = sorted.filter((a) => a.status === 'ACTIVE').length
    const dry = sorted.filter((a) => a.status === 'DRY').length
    return { all: sorted.length, milking, dry }
  }, [sorted])

  const filtered = useMemo(() => {
    return sorted.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      return matchesSearch(a, query)
    })
  }, [sorted, statusFilter, query])

  const openAnimal = async (animal: Animal) => {
    setSelectedId(animal.id)
    setSummary(null)
    setTimeline([])
    setFichaError('')
    setKindFilter('all')
    setLoadingFicha(true)
    const errors: string[] = []
    const [sumRes, timeRes] = await Promise.allSettled([
      api.getAnimalSummary(auth.token, animal.id, today),
      api.getAnimalTimeline(auth.token, animal.id),
    ])
    if (sumRes.status === 'fulfilled') setSummary(sumRes.value)
    else errors.push('No se pudo cargar la ficha')
    if (timeRes.status === 'fulfilled') setTimeline(timeRes.value.items || [])
    else errors.push('No se pudo cargar el historial')
    setFichaError(errors.join('. '))
    setLoadingFicha(false)
  }

  const selected = sorted.find((a) => a.id === selectedId) ?? summary?.animal ?? null
  const preg = pregnancyCard(summary, today)
  const lactationNumber = summary?.lactation.lactationNumber ?? 0
  const dim = summary?.lactation.daysInMilk
  const lastLiters = summary?.lastControl?.liters
  const photoSrc = selected?.photoUrl ? photoFileUrl(auth.token, selected.photoUrl) : null
  const eid = formatEid(selected?.electronicId ?? summary?.animal.electronicId)
  const notes = selected?.notes ?? summary?.animal.notes
  const birth = selected?.birthDate ?? summary?.animal.birthDate
  const age = ageText(birth, today)

  const groupedTimeline = useMemo(() => {
    const items = kindFilter === 'all' ? timeline : timeline.filter((i) => i.kind === kindFilter)
    const groups: { title: string; items: TimelineItem[] }[] = []
    for (const item of items) {
      const title = monthTitle(item.at)
      const last = groups[groups.length - 1]
      if (last && last.title === title) last.items.push(item)
      else groups.push({ title, items: [item] })
    }
    return groups
  }, [timeline, kindFilter])

  const chipBtn = (active: boolean) =>
    `min-h-11 px-3 rounded-full text-sm font-semibold border ${focusClass} ${
      active ? 'bg-primary text-on-primary border-primary' : 'bg-surface text-ink border-line hover:bg-subtle'
    }`

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <TamboPicker token={auth.token} tamboId={tamboId} onChange={setTamboId} />
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-3">
          <Field
            label="Buscar por caravana"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered[0]) {
                e.preventDefault()
                void openAnimal(filtered[0])
              }
            }}
            placeholder="Caravana o chip"
            className="min-h-11"
          />

          <div className="flex flex-wrap gap-2">
            <button type="button" className={chipBtn(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>
              Todas ({counts.all})
            </button>
            <button
              type="button"
              className={chipBtn(statusFilter === 'ACTIVE')}
              onClick={() => setStatusFilter('ACTIVE')}
            >
              En ordeñe ({counts.milking})
            </button>
            <button type="button" className={chipBtn(statusFilter === 'DRY')} onClick={() => setStatusFilter('DRY')}>
              Secas ({counts.dry})
            </button>
          </div>

          <p className="text-xs text-ink-muted" aria-live="polite">
            {filtered.length} de {sorted.length}
          </p>

          {!ready || loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !tamboId ? (
            <EmptyState>No hay tambos para mostrar</EmptyState>
          ) : animals.length === 0 ? (
            <EmptyState>No hay animales en este tambo</EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState>Ninguna vaca coincide con ‘{query || 'este filtro'}’</EmptyState>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void openAnimal(a)}
                className={`w-full text-left bg-surface border rounded-xl p-3 min-h-11 hover:bg-subtle transition ${focusClass} ${
                  selectedId === a.id ? 'border-primary ring-1 ring-primary' : 'border-line'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AnimalPhoto
                    src={a.photoUrl ? photoFileUrl(auth.token, a.photoUrl) : null}
                    alt=""
                    size={40}
                    fallback={tagFallback(a.earTag)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink truncate">{a.earTag}</span>
                      <Badge tone={a.status === 'DRY' ? 'neutral' : 'ok'}>
                        {a.status === 'DRY' ? 'Seca' : 'En ordeñe'}
                      </Badge>
                    </div>
                    {a.breed ? <div className="text-xs text-ink-muted mt-0.5 truncate">{a.breed}</div> : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="md:col-span-2">
          {!selectedId ? (
            <Card>
              <EmptyState>Elegí un animal para ver su ficha</EmptyState>
            </Card>
          ) : (
            <Card>
              <div className="space-y-5">
                {fichaError ? <ErrorBanner>{fichaError}</ErrorBanner> : null}
                {loadingFicha && !summary && timeline.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : null}

                {selected ? (
                  <div className="flex flex-wrap gap-4 items-start">
                    <AnimalPhoto
                      src={photoSrc}
                      alt={`Foto de ${selected.earTag}`}
                      size={96}
                      fallback={tagFallback(selected.earTag)}
                      onOpen={
                        photoSrc
                          ? () => {
                              window.open(photoSrc, '_blank', 'noopener,noreferrer')
                            }
                          : undefined
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <h4 className="font-bold text-ink text-2xl leading-tight">{selected.earTag}</h4>
                      {eid ? <p className="text-sm text-ink-muted font-mono">{eid}</p> : null}
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={selected.status === 'DRY' ? 'neutral' : 'ok'}>
                          {selected.status === 'DRY' ? 'Seca' : 'En ordeñe'}
                        </Badge>
                        {selected.breed ? <Badge tone="neutral">{selected.breed}</Badge> : null}
                      </div>
                      {birth ? (
                        <p className="text-sm text-ink-muted">
                          Nació el {formatDateOnly(birth)}
                          {age ? ` · ${age}` : ''}
                        </p>
                      ) : null}
                      {summary?.mother ? (
                        <p className="text-sm text-ink">Madre: caravana {summary.mother.earTag}</p>
                      ) : null}
                      {summary?.sire ? <p className="text-sm text-ink">Padre: {summary.sire.name}</p> : null}
                      {notes ? <p className="text-sm text-ink">{notes}</p> : null}
                    </div>
                  </div>
                ) : null}

                {summary ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <StatCard
                      label="Lactancia"
                      value={lactationNumber > 0 ? lactationNumber : '—'}
                      detail="según partos cargados"
                    />
                    <StatCard
                      label="Días en leche"
                      value={
                        selected?.status === 'DRY' ? 'Seca' : dim != null ? dim : '—'
                      }
                    />
                    <StatCard label="Preñez" value={preg.value} detail={preg.detail} />
                    <StatCard
                      label="Último control"
                      value={lastLiters != null ? `${formatLiters(lastLiters)} L` : '—'}
                      detail={controlDetail(summary)}
                    />
                  </div>
                ) : null}

                {summary && summary.alerts.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {summary.alerts.map((a, i) => {
                      const chip = alertChip(a.code, a.daysDelta, a.date)
                      if (!chip) return null
                      return (
                        <Badge key={`${a.code}-${i}`} tone={chip.tone}>
                          {chip.text}
                        </Badge>
                      )
                    })}
                  </div>
                ) : null}

                <div>
                  <h5 className="text-sm font-semibold text-ink mb-2">Historial</h5>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {KIND_CHIPS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={chipBtn(kindFilter === c.id)}
                        onClick={() => setKindFilter(c.id)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {loadingFicha && timeline.length === 0 ? (
                    <div className="text-center py-4">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                  ) : timeline.length === 0 ? (
                    <p className="text-sm text-ink-muted">Todavía no hay eventos para este animal.</p>
                  ) : groupedTimeline.length === 0 ? (
                    <p className="text-sm text-ink-muted">Ningún evento de este tipo.</p>
                  ) : (
                    <div className="space-y-4">
                      {groupedTimeline.map((group) => (
                        <div key={group.title}>
                          <h6 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
                            {group.title}
                          </h6>
                          <div className="space-y-2">
                            {group.items.map((item) => {
                              const body = timelineBody(item, auth.token)
                              return (
                                <div key={`${item.kind}-${item.id}`} className="bg-subtle rounded-lg p-3 text-sm">
                                  <div className="flex flex-wrap items-center gap-2 justify-between">
                                    <span className="text-ink-muted">{formatDateTime(item.at)}</span>
                                    <Badge tone="neutral">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
                                  </div>
                                  <div className="flex gap-3 mt-2 items-start">
                                    {body.photo ? (
                                      <a
                                        href={body.photo}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`shrink-0 ${focusClass} rounded-lg`}
                                      >
                                        <img
                                          src={body.photo}
                                          alt=""
                                          width={56}
                                          height={56}
                                          className="w-14 h-14 object-cover rounded-lg border border-line"
                                          onError={(e) => {
                                            e.currentTarget.style.display = 'none'
                                          }}
                                        />
                                      </a>
                                    ) : null}
                                    <div className="min-w-0">
                                      <div className="text-ink font-medium">{body.title}</div>
                                      {item.notes ? (
                                        <div className="text-ink-muted text-xs mt-1">{item.notes}</div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
