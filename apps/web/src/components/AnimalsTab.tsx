import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import type { Animal, TimelineItem } from '../types/dashboard'
import { TamboPicker, useTamboId } from './TamboPicker'
import { Badge, Card, EmptyState, ErrorBanner } from './ui'

interface AnimalsTabProps {
  auth: AuthToken
}

function kindLabel(item: TimelineItem): string {
  const labels: Record<string, string> = {
    health: 'Sanidad',
    repro: 'Reproducción',
    transfer: 'Traslado',
    control: 'Control lechero',
    weight: 'Peso',
    photo: 'Foto',
  }
  return labels[item.kind] || item.kind
}

export function AnimalsTab({ auth }: AnimalsTabProps) {
  const { tamboId, setTamboId, ready, error, setError } = useTamboId(auth.token)
  const [animals, setAnimals] = useState<Animal[]>([])
  const [selected, setSelected] = useState<Animal | null>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (!tamboId) {
      setAnimals([])
      setSelected(null)
      setTimeline([])
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
        setSelected(null)
        setTimeline([])
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

  const openAnimal = async (animal: Animal) => {
    setSelected(animal)
    try {
      setLoadingTimeline(true)
      const result = await api.getAnimalTimeline(auth.token, animal.id)
      setTimeline(result.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el historial')
    } finally {
      setLoadingTimeline(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <TamboPicker token={auth.token} tamboId={tamboId} onChange={setTamboId} />
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-2">
          {!ready || loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : !tamboId ? (
            <EmptyState>No hay tambos para mostrar</EmptyState>
          ) : animals.length === 0 ? (
            <EmptyState>No hay animales en este tambo</EmptyState>
          ) : (
            animals.map((a) => (
              <button
                key={a.id}
                onClick={() => openAnimal(a)}
                className={`w-full text-left bg-surface border rounded-xl p-3 hover:bg-subtle transition ${
                  selected?.id === a.id ? 'border-primary ring-1 ring-primary' : 'border-line'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">Caravana {a.earTag}</span>
                  <Badge tone={a.status === 'DRY' ? 'neutral' : 'ok'}>
                    {a.status === 'DRY' ? 'Seca' : 'En ordeñe'}
                  </Badge>
                </div>
                {a.breed ? <div className="text-xs text-ink-muted mt-1">{a.breed}</div> : null}
              </button>
            ))
          )}
        </div>

        <div className="md:col-span-2">
          {!selected ? (
            <Card>
              <EmptyState>Elegí un animal para ver su ficha</EmptyState>
            </Card>
          ) : (
            <Card>
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-ink text-lg">Caravana {selected.earTag}</h4>
                  <p className="text-sm text-ink-muted">
                    {selected.status === 'DRY' ? 'Seca' : 'En ordeñe'}
                    {selected.breed ? ` · ${selected.breed}` : ''}
                    {selected.birthDate ? ` · Nació ${selected.birthDate}` : ''}
                  </p>
                </div>

                <div>
                  <h5 className="text-sm font-semibold text-ink mb-2">Historial</h5>
                  {loadingTimeline ? (
                    <div className="text-center py-4">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  ) : timeline.length === 0 ? (
                    <p className="text-sm text-ink-muted">Todavía no hay eventos para este animal.</p>
                  ) : (
                    <div className="space-y-2">
                      {timeline.map((item) => (
                        <div key={`${item.kind}-${item.id}`} className="bg-subtle rounded-lg p-3 text-sm">
                          <div className="flex flex-wrap justify-between gap-2">
                            <span className="font-semibold text-ink">{kindLabel(item)}</span>
                            <span className="text-ink-muted">
                              {new Date(item.at).toLocaleString('es-AR')}
                            </span>
                          </div>
                          <div className="text-ink">{item.summary}</div>
                          {item.notes && <div className="text-ink-muted text-xs mt-1">{item.notes}</div>}
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
