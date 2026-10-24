import { ApiError, createHttp, loginLockMessage } from './http'

let failed = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`OK  ${name}${detail ? ` · ${detail}` : ''}`)
  else {
    failed += 1
    console.log(`FALLÓ  ${name}${detail ? ` · ${detail}` : ''}`)
  }
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function main() {
  {
    let calls = 0
    const http = createHttp({
      fetch: async () => {
        calls += 1
        return jsonResponse(200, { ok: true })
      },
      baseUrl: 'http://x',
    })
    const data = await http.request<{ ok: boolean }>('/health')
    check('pedido 200', data.ok === true && calls === 1, String(calls))
  }

  {
    let calls = 0
    let handlerCalls = 0
    const http = createHttp({
      fetch: async () => {
        calls += 1
        return jsonResponse(401, { error: 'Tu acceso fue modificado. Volvé a ingresar.', code: 'SESSION_REVOKED' })
      },
      baseUrl: 'http://x',
    })
    http.setSessionRevokedHandler(async () => {
      handlerCalls += 1
      await http.request('/auth/me', { token: 'old' }).catch(() => undefined)
    })
    await http.request('/hoy', { token: 'old' }).catch(() => undefined)
    await http.request('/hoy', { token: 'old' }).catch(() => undefined)
    check('SESSION_REVOKED llama al manejador una vez', handlerCalls === 1, String(handlerCalls))
    check('SESSION_REVOKED no vuelve a pedir', calls === 1, String(calls))
  }

  {
    let calls = 0
    let sent = ''
    const http = createHttp({
      fetch: async (_input, init) => {
        calls += 1
        sent = String(init?.body ?? '')
        return jsonResponse(200, {
          accessToken: 't',
          user: { id: '1', email: null, name: 'A' },
          tenant: { id: '2' },
          roles: ['DUENIO'],
        })
      },
      baseUrl: 'http://x',
    })
    await http.login('351 6123456', 'clave')
    check(
      'ingreso con identifier es un solo pedido',
      calls === 1 && sent.includes('"identifier"') && sent.includes('351 6123456') && !sent.includes('"email"'),
      sent,
    )
  }

  {
    let calls = 0
    let handlerCalls = 0
    const http = createHttp({
      fetch: async () => {
        calls += 1
        return jsonResponse(401, { error: 'Invalid credentials' })
      },
      baseUrl: 'http://x',
    })
    http.setSessionRevokedHandler(() => {
      handlerCalls += 1
    })
    await http.request('/x', { token: 't' }).catch(() => undefined)
    check('401 distinto no dispara el manejador', handlerCalls === 0 && calls === 1, String(handlerCalls))
  }

  {
    const http = createHttp({
      fetch: async () =>
        jsonResponse(429, {
          error: 'Demasiados intentos. Probá de nuevo más tarde.',
          code: 'LOGIN_LOCKED',
          retryAfterSeconds: 125,
        }),
      baseUrl: 'http://x',
    })
    let msg: string | null = null
    try {
      await http.login('a@b.c', 'p')
    } catch (err) {
      check('429 es ApiError LOGIN_LOCKED', err instanceof ApiError && err.code === 'LOGIN_LOCKED')
      msg = loginLockMessage(err)
    }
    check(
      'LOGIN_LOCKED muestra minutos',
      msg === 'Demasiados intentos. Probá de nuevo en 3 minutos.',
      msg ?? '',
    )
  }

  if (failed > 0) {
    console.log(`FALLÓ (${failed})`)
    process.exit(1)
  }
  console.log('OK')
}

void main()
