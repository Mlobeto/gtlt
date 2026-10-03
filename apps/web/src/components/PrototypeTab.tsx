import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import type { AppPrototypeConfig } from '../types/dashboard'
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, TextareaField } from './ui'

interface PrototypeTabProps {
  auth: AuthToken
}

export function PrototypeTab({ auth }: PrototypeTabProps) {
  const [configs, setConfigs] = useState<AppPrototypeConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    version: '',
    codeUrl: '',
    prototypeUrl: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const fetchConfigs = async () => {
    try {
      setLoading(true)
      const result = await api.getAppPrototypeConfigs(auth.token)
      setConfigs(result.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar configuraciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfigs()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      await api.createAppPrototypeConfig(auth.token, {
        ...formData,
        active: true,
      })
      setFormData({ name: '', version: '', codeUrl: '', prototypeUrl: '', notes: '' })
      setShowForm(false)
      await fetchConfigs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear configuración')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with button */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h3 className="text-lg font-bold text-ink">Versiones del Prototipo</h3>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : 'Agregar Nueva Versión'}
        </Button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Form */}
      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Nombre"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ej. Prototipo v2.1"
                required
              />
              <Field
                label="Versión"
                type="text"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="ej. 2.1.0"
              />
              <Field
                label="URL del Código"
                type="url"
                value={formData.codeUrl}
                onChange={(e) => setFormData({ ...formData, codeUrl: e.target.value })}
                placeholder="https://github.com/..."
              />
              <Field
                label="URL del Prototipo"
                type="url"
                value={formData.prototypeUrl}
                onChange={(e) => setFormData({ ...formData, prototypeUrl: e.target.value })}
                placeholder="https://app.gtlt.local"
              />
            </div>

            <TextareaField
              label="Notas"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas de testing, cambios importantes, credenciales de demo..."
              rows={4}
            />

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Configs list */}
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : configs.length === 0 ? (
        <EmptyState>No hay configuraciones de prototipo</EmptyState>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <Card key={config.id}>
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">{config.name}</h3>
                  {config.version && <p className="text-sm text-ink-muted">v{config.version}</p>}
                </div>
                {config.active && <Badge tone="ok">Activo</Badge>}
              </div>

              {config.notes && (
                <div className="mb-3 p-3 bg-subtle rounded-lg text-sm text-ink break-words">
                  {config.notes}
                </div>
              )}

              <div className="space-y-2 text-sm">
                {config.codeUrl && (
                  <div>
                    <a
                      href={config.codeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-deep hover:text-primary underline"
                    >
                      Ver código
                    </a>
                  </div>
                )}
                {config.prototypeUrl && (
                  <div>
                    <a
                      href={config.prototypeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-deep hover:text-primary underline"
                    >
                      Abrir prototipo
                    </a>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-line text-xs text-ink-muted">
                Creado: {new Date(config.createdAt).toLocaleDateString('es-AR')}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
