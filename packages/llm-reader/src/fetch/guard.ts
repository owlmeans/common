import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ReaderRefusedError } from '../errors.js'
import { LOCAL_NAMES, LOCAL_SUFFIXES, NON_PUBLIC_V4 } from './guard/consts.js'
import type { AddressGuard, AddressGuardOptions } from './guard/types.js'

const v4ToInt = (ip: string): number =>
  ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0

const inV4 = (ip: string, [network, prefix]: readonly [string, number]): boolean => {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  return (v4ToInt(ip) & mask) === (v4ToInt(network) & mask)
}

/** The 8 hextets of an IPv6 address (no zone), or `undefined`. */
const hextets = (ip: string): number[] | undefined => {
  let address = ip.toLowerCase().split('%')[0]!
  const embedded = address.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (embedded != null) {
    const v4 = v4ToInt(embedded[1]!)
    address = address.slice(0, -embedded[1]!.length) + `${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`
  }
  const [head = '', tail] = address.split('::')
  const left = head.length > 0 ? head.split(':') : []
  const right = tail != null && tail.length > 0 ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  if (tail == null ? left.length !== 8 : missing < 0) return undefined
  const all = [...left, ...Array(tail == null ? 0 : missing).fill('0'), ...right].map(h => parseInt(h, 16))
  return all.length === 8 && all.every(h => Number.isInteger(h) && h >= 0 && h <= 0xffff) ? all : undefined
}

const v4Of = (high: number, low: number): string =>
  [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')

/** Refuses non-public targets. Exported because the renderer guards its own sub-requests with it. */
export const createAddressGuard = (options: AddressGuardOptions = {}): AddressGuard => {
  const allowHosts = (options.allowHosts ?? []).map(host => host.toLowerCase())

  const allowed = (host: string): boolean =>
    allowHosts.some(entry => host === entry || host.endsWith(`.${entry}`))

  const isNonPublic = (address: string): boolean => {
    const family = isIP(address)
    if (family === 4) return NON_PUBLIC_V4.some(range => inV4(address, range))
    if (family !== 6) return true // unparseable — refuse rather than guess
    const h = hextets(address)
    if (h == null) return true
    if (h.every(x => x === 0)) return true // ::
    if (h.slice(0, 7).every(x => x === 0) && h[7] === 1) return true // ::1
    // IPv4-mapped / -compatible, NAT64 (64:ff9b::/96) and 6to4 (2002::/16) carry a v4 address.
    if (h.slice(0, 5).every(x => x === 0) && (h[5] === 0xffff || h[5] === 0)) return isNonPublic(v4Of(h[6]!, h[7]!))
    if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every(x => x === 0)) return isNonPublic(v4Of(h[6]!, h[7]!))
    if (h[0] === 0x2002) return isNonPublic(v4Of(h[1]!, h[2]!))
    const first = h[0]!

    return (first & 0xfe00) === 0xfc00 // unique local fc00::/7
      || (first & 0xffc0) === 0xfe80 // link-local fe80::/10
      || (first & 0xffc0) === 0xfec0 // site-local fec0::/10
      || (first & 0xff00) === 0xff00 // multicast
      || (first === 0x2001 && h[1] === 0x0db8) // documentation
  }

  const refuse = (host: string, reason: string): never => {
    throw new ReaderRefusedError(`${reason}:${host}`)
  }

  const checkAddress = (host: string, address: string): void => {
    if (options.allowPrivateNetwork === true || allowed(host)) return
    if (isNonPublic(address)) refuse(host, 'non-public-address')
  }

  const check = async (url: string, resolve: boolean): Promise<void> => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return refuse(url, 'bad-url')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') refuse(parsed.protocol, 'scheme')
    if (parsed.username !== '' || parsed.password !== '') refuse(parsed.hostname, 'credentials-in-url')
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (options.allowPrivateNetwork === true || allowed(host)) return
    if (isIP(host) !== 0) return checkAddress(host, host)
    if (LOCAL_NAMES.includes(host) || LOCAL_SUFFIXES.some(suffix => host.endsWith(suffix))) refuse(host, 'local-name')
    if (!resolve) return
    const addresses = await lookup(host, { all: true }).catch(() => [])
    if (addresses.length === 0) refuse(host, 'unresolvable')
    addresses.forEach(entry => checkAddress(host, entry.address))
  }

  return { check, checkAddress, isNonPublic }
}
