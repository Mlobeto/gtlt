import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AuthToken } from '../types/auth'

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
      <div className="flex justify-between items-center gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Equipo del tambo</h3>
        <div className="flex gap-2">
          {tambos.length > 1 && (
            <select
              value={tamboId}
              onChange={(e) => {
                setInviteToken('')
                setTamboId(e.target.value)
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              {tambos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Invitar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      )}

      {inviteToken ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 px-4 py-3 rounded-lg text-sm">
          Invitación lista. Pasale este token (7 días, un solo uso):
          <code className="block mt-2 break-all bg-white p-2 rounded border">{inviteToken}</code>
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={handleInvite} className="bg-white border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="px-3 py-2 border rounded-lg"
              placeholder="Correo"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <input
              className="px-3 py-2 border rounded-lg"
              placeholder="Teléfono (si no hay correo)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <input
              className="px-3 py-2 border rounded-lg"
              placeholder="Nombre (opcional)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className="px-3 py-2 border rounded-lg"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'TAMBERO' | 'VETERINARIO' })}
            >
              <option value="TAMBERO">Tambero</option>
              <option value="VETERINARIO">Veterinario</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Enviando...' : 'Crear invitación'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Nadie asignado a este tambo todavía.</div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="bg-white border rounded-lg p-4 flex justify-between">
              <div>
                <p className="font-semibold">{m.user.name}</p>
                <p className="text-sm text-gray-600">
                  {m.user.email || m.user.phone || 'Sin contacto'}
                  {m.companyName ? ` · ${m.companyName}` : ''}
                </p>
              </div>
              <div className="text-right text-sm">
                <p>{m.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</p>
                <p className="text-gray-500">{m.status === 'ACTIVE' ? 'Activo' : 'Pendiente'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
