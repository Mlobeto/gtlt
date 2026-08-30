import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import type { AppPrototypeConfig } from '../types/dashboard'

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
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Versiones del Prototipo</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
        >
          {showForm ? 'Cancelar' : 'Agregar Nueva Versión'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ej. Prototipo v2.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Versión
              </label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="ej. 2.1.0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL del Código
              </label>
              <input
                type="url"
                value={formData.codeUrl}
                onChange={(e) => setFormData({ ...formData, codeUrl: e.target.value })}
                placeholder="https://github.com/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL del Prototipo
              </label>
              <input
                type="url"
                value={formData.prototypeUrl}
                onChange={(e) => setFormData({ ...formData, prototypeUrl: e.target.value })}
                placeholder="https://app.gtlt.local"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas de testing, cambios importantes, credenciales de demo..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {/* Configs list */}
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No hay configuraciones de prototipo
        </div>
      ) : (
        <div className="space-y-4">
          {configs.map((config) => (
            <div
              key={config.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{config.name}</h3>
                  {config.version && (
                    <p className="text-sm text-gray-600">v{config.version}</p>
                  )}
                </div>
                {config.active && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                    Activo
                  </span>
                )}
              </div>

              {config.notes && (
                <div className="mb-3 p-3 bg-gray-50 rounded text-sm text-gray-700">
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
                      className="text-green-600 hover:text-green-700 underline"
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
                      className="text-green-600 hover:text-green-700 underline"
                    >
                      Abrir prototipo
                    </a>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                Creado: {new Date(config.createdAt).toLocaleDateString('es-AR')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
