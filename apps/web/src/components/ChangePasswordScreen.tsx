import { useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { AuthToken } from '../types/auth'
import { Button, Card, ErrorBanner, Field } from './ui'

export function ChangePasswordScreen({
  auth,
  onChanged,
  title = 'Elegí tu clave',
  required = false,
}: {
  auth: AuthToken
  onChanged: (next: AuthToken) => void
  title?: string
  required?: boolean
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      setError('La clave nueva tiene que tener al menos 8 caracteres.')
      return
    }
    if (newPassword === currentPassword) {
      setError('La clave nueva tiene que ser distinta de la actual.')
      return
    }
    if (newPassword !== repeat) {
      setError('La clave nueva y la repetición no coinciden.')
      return
    }
    try {
      setBusy(true)
      setError('')
      const result = await api.changePassword(auth.token, currentPassword, newPassword)
      onChanged({
        token: result.accessToken,
        userId: result.user.id,
        tenantId: result.tenant.id,
        roles: result.roles,
        mustChangePassword: false,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo cambiar la clave')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={required ? 'min-h-screen bg-subtle flex items-center justify-center p-4' : ''}>
      <Card className={required ? 'w-full max-w-md' : ''} title={title}>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          {required ? (
            <p className="text-sm text-ink-muted">
              Antes de seguir, cambiá la clave inicial que te pasaron.
            </p>
          ) : null}
          <Field
            label="Clave actual"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Field
            label="Clave nueva"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="Mínimo 8 caracteres, distinta de la actual."
            required
          />
          <Field
            label="Repetí la clave nueva"
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
          {error ? <ErrorBanner>{error}</ErrorBanner> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Guardando...' : 'Guardar clave'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
