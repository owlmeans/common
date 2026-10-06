import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { SsrfHelper } from './ssrf/types.js'

export const createSsrfHelper = (): SsrfHelper => {
  const isPrivateAddress = (address: string): boolean => {
    const family = isIP(address)
    if (family === 0) return true // unparseable — refuse rather than guess

    let ip = address
    if (family === 6 && ip.toLowerCase().startsWith('::ffff:')) {
      const mapped = ip.slice(7)
      if (isIP(mapped) === 4) ip = mapped
    }

    if (isIP(ip) === 4) {
      const [a, b] = ip.split('.').map(Number)

      return a === 127 || a === 10 || a === 0
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || (a === 169 && b === 254)
    }

    const lower = ip.toLowerCase()

    return lower === '::1' || lower === '::'
      || lower.startsWith('fe80:') // link-local
      || lower.startsWith('fc') || lower.startsWith('fd') // unique local, fc00::/7
  }

  const assertPublicHostname = async (hostname: string): Promise<void> => {
    const direct = isIP(hostname)
    const addresses = direct !== 0
      ? [hostname]
      : (await lookup(hostname, { all: true })).map(entry => entry.address)

    if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
      throw new Error(`refused-address:${hostname}`)
    }
  }

  return { isPrivateAddress, assertPublicHostname }
}

export const ssrfHelper = createSsrfHelper()
