import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export function TamboPicker({
  token,
  tamboId,
  onChange,
}: {
  token: string
  tamboId: string
  onChange: (id: string) => void
}) {
  const [tambos, setTambos] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    api
      .getTambos(token)
      .then((r) => {
        const items = r.items || []
        setTambos(items)
        if (!tamboId && items[0]) onChange(items[0].id)
      })
      .catch((err) => {
        console.error(err instanceof Error ? err.message : 'Error al cargar tambos')
      })
  }, [token])

  if (tambos.length <= 1) return null

  return (
    <select
      value={tamboId}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 bg-surface border border-line rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {tambos.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}

export function useTamboId(token: string) {
  const [tamboId, setTamboId] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getTambos(token)
      .then((r) => {
        setTamboId(r.items?.[0]?.id ?? '')
        setReady(true)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar tambos')
        setReady(true)
      })
  }, [token])

  return { tamboId, setTamboId, ready, error, setError }
}
