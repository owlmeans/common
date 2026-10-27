import type { BotPlatform } from '@owlmeans/bot'
import { BOT_HOOK_PATH } from '../consts.js'
import { BOT_HOST_PATTERN, BOT_PRIVATE_SUFFIXES, BOT_PRIVATE_V4 } from './origin/consts.js'
import type { BotOriginHelper } from './origin/types.js'

export const createBotOriginHelper = (): BotOriginHelper => {
  const first = (value: string | string[] | undefined): string | undefined => {
    const raw = Array.isArray(value) ? value[0] : value
    const head = raw?.split(',')[0]?.trim()

    return head == null || head === '' ? undefined : head
  }

  const originOf = (headers: Record<string, string | string[] | undefined>): string | undefined => {
    const lower = Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]))
    const proto = (first(lower['x-forwarded-proto']) ?? 'http').toLowerCase()
    const host = first(lower['x-forwarded-host']) ?? first(lower.host)
    if (host == null || !BOT_HOST_PATTERN.test(host) || (proto !== 'http' && proto !== 'https')) {
      return undefined
    }

    return `${proto}://${host.toLowerCase()}`
  }

  const privateV4 = (host: string): boolean | null => {
    const octets = host.split('.')
    if (octets.length !== 4 || !octets.every(octet => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)) {
      return null
    }
    const address = octets.reduce((sum, octet) => sum * 256 + Number(octet), 0)

    return BOT_PRIVATE_V4.some(([a, b, bits]) => {
      const base = (a * 256 + b) * 65536
      const size = 2 ** (32 - bits)
      return address >= base && address < base + size
    })
  }

  const isPublicHttps = (url: string): boolean => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }
    if (parsed.protocol !== 'https:') {
      return false
    }
    const host = parsed.hostname.toLowerCase()
    if (host.startsWith('[')) {
      const v6 = host.slice(1, -1)
      return !(v6 === '::1' || v6 === '::' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6))
    }
    const v4 = privateV4(host)
    if (v4 != null) {
      return !v4
    }

    return host.includes('.') && host !== 'localhost' && !BOT_PRIVATE_SUFFIXES.some(suffix => host.endsWith(suffix))
  }

  const hookUrl = (origin: string, platform: BotPlatform, connection: string): string =>
    `${origin.replace(/\/+$/, '')}${BOT_HOOK_PATH}/${platform}/${encodeURIComponent(connection)}`

  return { originOf, isPublicHttps, hookUrl }
}

export const botOriginHelper = createBotOriginHelper()
