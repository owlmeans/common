import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { RequestOrigin } from '../types.js'

const USER_AGENT_MAX = 512
const HEADER_MAX = 1024

type Headers = AbstractRequest['headers']

/** A header's first value (Fastify lower-cases names; a repeated header arrives as an array). */
const headerOf = (headers: Headers | undefined, name: string): string | undefined => {
  const raw = headers?.[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()

  return trimmed === '' ? undefined : trimmed
}

/** The socket peer of the original server request, when the transport exposes one. */
const socketOf = (req: AbstractRequest): string | undefined => {
  const original = req.original as {
    socket?: { remoteAddress?: string }, raw?: { socket?: { remoteAddress?: string } }, ip?: string,
  } | undefined
  const address = original?.socket?.remoteAddress ?? original?.raw?.socket?.remoteAddress ?? original?.ip

  return typeof address === 'string' && address !== '' ? address : undefined
}

/**
 * The evidence a consumer act is recorded with. `ip` is `cf-connecting-ip` (a Cloudflare edge
 * sets it and strips a client's own), else the LAST `x-forwarded-for` entry (the one the nearest
 * proxy appended — the first is whatever the client claimed), else `x-real-ip`, else the socket
 * peer. The raw `x-forwarded-for`, the `user-agent` (at most 512 characters), `cf-ipcountry`
 * (the geolocated country — second location evidence for VAT) and `accept-language` are kept as
 * they arrived. The default `metaOf` of the consumer-rights handlers.
 */
export const requestOriginOf = (req: AbstractRequest): RequestOrigin => {
  const headers = req.headers
  const forwardedFor = headerOf(headers, 'x-forwarded-for')
  const forwarded = forwardedFor?.split(',').map(entry => entry.trim()).filter(entry => entry !== '')
  const ip = headerOf(headers, 'cf-connecting-ip') ?? forwarded?.[forwarded.length - 1]
    ?? headerOf(headers, 'x-real-ip') ?? socketOf(req)
  const userAgent = headerOf(headers, 'user-agent')
  const ipCountry = headerOf(headers, 'cf-ipcountry')
  const acceptLanguage = headerOf(headers, 'accept-language')

  return {
    ...(ip != null ? { ip: ip.slice(0, HEADER_MAX) } : {}),
    ...(forwardedFor != null ? { forwardedFor: forwardedFor.slice(0, HEADER_MAX) } : {}),
    ...(userAgent != null ? { userAgent: userAgent.slice(0, USER_AGENT_MAX) } : {}),
    ...(ipCountry != null && /^[A-Za-z]{2}$/.test(ipCountry) ? { ipCountry: ipCountry.toUpperCase() } : {}),
    ...(acceptLanguage != null ? { acceptLanguage: acceptLanguage.slice(0, 256) } : {}),
  }
}

/** The origin fields of a record: only those with a value. */
export const originFields = (origin: RequestOrigin | undefined): RequestOrigin => Object.fromEntries(
  Object.entries(origin ?? {}).filter(([key, value]) =>
    ['ip', 'forwardedFor', 'userAgent', 'ipCountry', 'acceptLanguage', 'via'].includes(key)
    && typeof value === 'string' && value !== ''),
) as RequestOrigin
