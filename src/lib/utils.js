export function isOutOfOffice(text = '') {
  const t = String(text || '').toLowerCase()
  return /(out\s?of\s?office|auto-?reply|vacation|away\suntil)/i.test(t)
}

export function buildMessageId(domain = process.env.SENDGRID_MESSAGE_DOMAIN || 'localhost') {
  const id = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`
  return `<${id}@${domain}>`
}

export function extractPlain(text, html) {
  if (text && text.trim().length) return text
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function safeParseHeaders(str) {
  try {
    const out = {}
    for (const line of str.split(/\r?\n/)) {
      const idx = line.indexOf(':')
      if (idx > -1) out[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
    }
    return out
  } catch {
    return undefined
  }
}