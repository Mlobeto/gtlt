import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import { PartLifeSettings } from './PartLifeSettings'
import { TambosSection } from './TambosSection'
import { Card, ErrorBanner, inputClass } from './ui'

interface SettingsTabProps {
  auth: AuthToken
}

type Provider = { id: string; name: string }

export function SettingsTab({ auth }: SettingsTabProps) {
  const [tambos, setTambos] = useState<{ id: string; name: string }[]>([])
  const [tamboId, setTamboId] = useState('')
  const [catalog, setCatalog] = useState<Provider[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.getTambos(auth.token)
        const items = result.items || []
        setTambos(items)
        if (items[0]) setTamboId(items[0].id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar tambos')
      }
    }
    void load()
  }, [auth])

  useEffect(() => {
    if (!tamboId) return
    const loadProvider = async () => {
      try {
        setError('')
        const result = await api.getTamboServiceProvider(auth.token, tamboId)
        setCatalog(result.catalog || [])
        setSelectedId(result.selectedId || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar proveedor')
      }
    }
    void loadProvider()
  }, [auth, tamboId])

  const save = async (serviceProviderId: string) => {
    setSelectedId(serviceProviderId)
    try {
      setSaving(true)
      await api.updateTamboServiceProvider(auth.token, tamboId, serviceProviderId)
      setStatus('Proveedor de service guardado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
    <TambosSection token={auth.token} />
    <PartLifeSettings token={auth.token} />
    <Card title="Configuración del tambo">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Elegí el proveedor de service por defecto. No se puede dar de alta uno nuevo desde acá.
        </p>
        {tambos.length > 1 && (
          <select
            value={tamboId}
            onChange={(e) => setTamboId(e.target.value)}
            className={`${inputClass} max-w-md`}
          >
            {tambos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {status && (
          <div className="bg-primary-soft border border-primary/30 text-primary-deep px-4 py-3 rounded-lg text-sm">
            {status}
          </div>
        )}
        <select
          value={selectedId}
          onChange={(e) => void save(e.target.value)}
          disabled={saving || catalog.length === 0}
          className={`${inputClass} max-w-md`}
        >
          <option value="">Sin proveedor</option>
          {catalog.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </Card>
    </div>
  )
}
