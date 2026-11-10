import type { RedactedProxy, RedactUtils } from './redact/types.js'

export const createRedactUtils = (): RedactUtils => {
  const opaque = /^[A-Za-z0-9_-]{20,}$/

  const url = (input: string | URL): string => {
    let parsed: URL
    try {
      parsed = typeof input === 'string' ? new URL(input) : input
    } catch {
      return '<invalid-url>'
    }
    const path = parsed.pathname.split('/').map(segment => opaque.test(segment) ? '***' : segment).join('/')

    return `${parsed.protocol}//${parsed.host}${path}`
  }

  const proxy = (endpoint: RedactedProxy): string => endpoint.id ?? `${endpoint.type}://${endpoint.host}:${endpoint.port}`

  return { url, proxy }
}

export const redactUtils = createRedactUtils()
