import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import type { Tambo, Animal, TimelineItem } from '../types/dashboard'

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
  const [tambos, setTambos] = useState<Tambo[]>([])
  const [tamboId, setTamboId] = useState('')
  const [animals, setAnimals] = useState<Animal[]>([])
  const [selected, setSelected] = useState<Animal | null>(null)
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchTambos = async () => {
      try {
        const result = await api.getTambos(auth.token)
        setTambos(result.items || [])
        if (result.items?.[0]) setTamboId(result.items[0].id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar tambos')
      } finally {
        setLoading(false)
      }
    }
    fetchTambos()
  }, [auth])

  useEffect(() => {
    if (!tamboId) return
    const fetchAnimals = async () => {
      try {
        setLoading(true)
        const result = await api.getAnimals(auth.token, tamboId)
        setAnimals(result.items || [])
        setSelected(null)
        setTimeline([])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar animales')
      } finally {
        setLoading(false)
      }
    }
    fetchAnimals()
  }, [auth, tamboId])

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
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Animales</h3>
        {tambos.length > 1 && (
          <select
            value={tamboId}
            onChange={(e) => setTamboId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          >
            {tambos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-2">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            </div>
          ) : animals.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No hay animales en este tambo</div>
          ) : (
            animals.map((a) => (
              <button
                key={a.id}
                onClick={() => openAnimal(a)}
                className={`w-full text-left bg-white border rounded-lg p-3 hover:shadow-md transition ${
                  selected?.id === a.id ? 'border-green-600 ring-1 ring-green-600' : 'border-gray-200'
                }`}
              >
                <div className="font-semibold text-gray-900">Caravana {a.earTag}</div>
                <div className="text-xs text-gray-500">
                  {a.status === 'DRY' ? 'Seca' : 'En ordeñe'}
                  {a.breed ? ` · ${a.breed}` : ''}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="md:col-span-2">
          {!selected ? (
            <div className="text-center py-8 text-gray-500">Elegí un animal para ver su ficha</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
              <div>
                <h4 className="font-semibold text-gray-900 text-lg">Caravana {selected.earTag}</h4>
                <p className="text-sm text-gray-600">
                  {selected.status === 'DRY' ? 'Seca' : 'En ordeñe'}
                  {selected.breed ? ` · ${selected.breed}` : ''}
                  {selected.birthDate ? ` · Nació ${selected.birthDate}` : ''}
                </p>
              </div>

              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-2">Historial</h5>
                {loadingTimeline ? (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                  </div>
                ) : timeline.length === 0 ? (
                  <p className="text-sm text-gray-500">Todavía no hay eventos para este animal.</p>
                ) : (
                  <div className="space-y-2">
                    {timeline.map((item) => (
                      <div key={`${item.kind}-${item.id}`} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="flex justify-between">
                          <span className="font-medium text-gray-800">{kindLabel(item)}</span>
                          <span className="text-gray-500">
                            {new Date(item.at).toLocaleString('es-AR')}
                          </span>
                        </div>
                        <div className="text-gray-600">{item.summary}</div>
                        {item.notes && <div className="text-gray-500 text-xs mt-1">{item.notes}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
