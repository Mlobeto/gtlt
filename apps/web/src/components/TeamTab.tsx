import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'
import { Badge, Button, Card, EmptyState, ErrorBanner, inputClass } from './ui'

interface TeamTabProps {
  auth: AuthToken
}

type Member = {
  id: string
  roles: string[]
  status: 'PENDING' | 'ACTIVE'
  companyName: string | null
  user: { id: string; name: string; email: string | null; phone: string | null }
}

const ROLE_LABEL: Record<string, string> = {
  TAMBERO: 'Tambero',
  VETERINARIO: 'Veterinario',
  TECNICO: 'Técnico',
  DUENIO: 'Dueño',
  ADMIN: 'Admin',
}

export function TeamTab({ auth }: TeamTabProps) {
  const [tambos, setTambos] = useState<{ id: string; name: string }[]>([])
  const [tamboId, setTamboId] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [inviteToken, setInviteToken] = useState('')
  const [form, setForm] = useState({
    email: '',
    phone: '',
    name: '',
    role: 'TAMBERO' as 'TAMBERO' | 'VETERINARIO',
  })

  useEffect(() => {
    const loadTambos = async () => {
      try {
        const result = await api.getTambos(auth.token)
        const items = result.items || []
        setTambos(items)
        if (items[0]) setTamboId(items[0].id)
        else setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar tambos')
        setLoading(false)
      }
    }
    void loadTambos()
  }, [auth.token])

  const loadTeam = async () => {
    if (!tamboId) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const result = await api.getTeam(auth.token, tamboId)
      setMembers(result.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el equipo')
      setMembers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTeam()
  }, [tamboId])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email && !form.phone) {
      setError('Poné un correo o un teléfono')
      return
    }
    try {
      setSubmitting(true)
      setError('')
      const result = await api.inviteMember(auth.token, {
        tamboId,
        email: form.email || undefined,
        phone: form.phone || undefined,
        name: form.name || undefined,
        role: form.role,
      })
      setInviteToken(result.inviteToken || '')
      setForm({ email: '', phone: '', name: '', role: 'TAMBERO' })
      setShowForm(false)
      await loadTeam()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo invitar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {inviteToken ? (
        <div className="bg-accent-soft border border-accent/40 text-accent-text px-4 py-3 rounded-lg text-sm">
          Invitación lista. Pasale este token (7 días, un solo uso):
          <code className="block mt-2 break-all bg-surface p-2 rounded border border-line text-ink">
            {inviteToken}
          </code>
        </div>
      ) : null}

      <Card
        title="Equipo del tambo"
        action={
          <div className="flex flex-wrap gap-2">
            {tambos.length > 1 && (
              <select
                value={tamboId}
                onChange={(e) => {
                  setInviteToken('')
                  setTamboId(e.target.value)
                }}
                className={inputClass}
              >
                {tambos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <Button onClick={() => setShowForm((v) => !v)}>Invitar</Button>
          </div>
        }
      >
        {showForm ? (
          <form onSubmit={handleInvite} className="border border-line rounded-lg p-4 space-y-3 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className={inputClass}
                placeholder="Correo"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Teléfono (si no hay correo)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Nombre (opcional)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <select
                className={inputClass}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as 'TAMBERO' | 'VETERINARIO' })}
              >
                <option value="TAMBERO">Tambero</option>
                <option value="VETERINARIO">Veterinario</option>
              </select>
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Enviando...' : 'Crear invitación'}
            </Button>
          </form>
        ) : null}

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : members.length === 0 ? (
          <EmptyState>Nadie asignado a este tambo todavía.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{m.user.name}</p>
                  <p className="text-sm text-ink-muted break-all">
                    {m.user.email || m.user.phone || 'Sin contacto'}
                    {m.companyName ? ` · ${m.companyName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-ink">{m.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</span>
                  <Badge tone={m.status === 'ACTIVE' ? 'ok' : 'warn'}>
                    {m.status === 'ACTIVE' ? 'Activo' : 'Pendiente'}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
