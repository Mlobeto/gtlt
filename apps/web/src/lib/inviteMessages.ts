export function buildInviteMessages(input: {
  inviterName: string
  tamboName: string
  role: string
  token: string
  webUrl: string
}): { intro: string; code: string } {
  const webUrl = input.webUrl.replace(/\/$/, '')
  const first =
    input.role === 'TECNICO'
      ? `Hola, ${input.inviterName} te invitó a CAL para atender los pedidos de service de ${input.tamboName}.`
      : `Hola, ${input.inviterName} te invitó a CAL para trabajar en ${input.tamboName}.`
  const lines = [first, '']
  if (webUrl) {
    lines.push('Para activar tu cuenta, abrí este enlace:')
    lines.push(`${webUrl}/#invitacion=${input.token}`)
    lines.push('')
  }
  lines.push(
    'También podés hacerlo desde la app: tocá «Tengo un código de invitación» y pegá el código que te mando en el mensaje siguiente.',
  )
  lines.push('')
  lines.push('El código vence en 7 días.')
  return { intro: lines.join('\n'), code: input.token }
}
