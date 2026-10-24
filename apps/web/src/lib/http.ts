export const SESSION_REVOKED_MESSAGE = 'Tu acceso fue modificado. Volvé a ingresar.'

export class ApiError extends Error {
  status: number
  code?: string
  body?: unknown

  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.body = body
  }
}

export function loginLockMessage(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 429 || err.code !== 'LOGIN_LOCKED') return null
  const body = err.body as { retryAfterSeconds?: number } | null
  const seconds = Number(body?.retryAfterSeconds) || 0
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return `Demasiados intentos. Probá de nuevo en ${minutes} minutos.`
}

function headerHasBearer(headers?: HeadersInit): boolean {
  if (!headers) return false
  if (headers instanceof Headers) {
    return Boolean(headers.get('Authorization')?.startsWith('Bearer '))
  }
  if (Array.isArray(headers)) {
    return headers.some(
      ([key, value]) => key.toLowerCase() === 'authorization' && String(value).startsWith('Bearer '),
    )
  }
  const rec = headers as Record<string, string>
  const value = rec.Authorization ?? rec.authorization
  return Boolean(value?.startsWith('Bearer '))
}

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function createHttp(deps: { fetch: FetchFn; baseUrl?: string }) {
  let handler: (() => void | Promise<void>) | null = null
  let latch = false
  let inFlight: Promise<void> | null = null

  function setSessionRevokedHandler(next: (() => void | Promise<void>) | null) {
    handler = next
  }

  function resetSessionRevokedLatch() {
    latch = false
    inFlight = null
  }

  function isSessionRevoked() {
    return latch
  }

  async function fireSessionRevoked() {
    latch = true
    if (inFlight) return inFlight
    inFlight = Promise.resolve(handler?.()).then(() => undefined)
    return inFlight
  }

  async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (latch && headerHasBearer(init?.headers)) {
      return new Response(
        JSON.stringify({ error: SESSION_REVOKED_MESSAGE, code: 'SESSION_REVOKED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }
    const res = await deps.fetch(input, init)
    if (res.status === 401) {
      const body = (await res.clone().json().catch(() => null)) as { code?: string } | null
      if (body?.code === 'SESSION_REVOKED') await fireSessionRevoked()
    }
    return res
  }

  async function request<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
    const { token, headers, ...rest } = options
    if (token && latch) {
      throw new ApiError(SESSION_REVOKED_MESSAGE, 401, 'SESSION_REVOKED')
    }
    const merged: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string> | undefined),
    }
    const url = `${deps.baseUrl ?? ''}${path}`
    const res = await apiFetch(url, { ...rest, headers: merged })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (token && latch && body.code === 'SESSION_REVOKED') {
      throw new ApiError(SESSION_REVOKED_MESSAGE, 401, 'SESSION_REVOKED', body)
    }
    if (!res.ok) {
      throw new ApiError(String(body.error ?? `HTTP ${res.status}`), res.status, body.code as string | undefined, body)
    }
    return body as T
  }

  async function login(identifier: string, password: string, tenantId?: string) {
    const res = await apiFetch(`${deps.baseUrl ?? ''}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password, ...(tenantId ? { tenantId } : {}) }),
    })
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 400 && body?.error === 'tenantId required' && Array.isArray(body.tenants)) {
      const err = new Error('tenantId required') as Error & {
        code: 'TENANT_REQUIRED'
        tenants: { id: string; name: string; roles: string[] }[]
      }
      err.code = 'TENANT_REQUIRED'
      err.tenants = body.tenants as { id: string; name: string; roles: string[] }[]
      throw err
    }
    if (!res.ok) {
      throw new ApiError(String(body?.error ?? 'Login failed'), res.status, body?.code as string | undefined, body)
    }
    return body as {
      accessToken: string
      user: { id: string; email: string | null; name: string }
      tenant: { id: string }
      roles: string[]
      mustChangePassword?: boolean
    }
  }

  return {
    apiFetch,
    request,
    login,
    setSessionRevokedHandler,
    resetSessionRevokedLatch,
    isSessionRevoked,
  }
}
