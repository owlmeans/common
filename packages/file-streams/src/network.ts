import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { logger } from '@owlmeans/log'
import { NetworkPolicyError } from './errors.js'
import { DEFAULT_SCHEMES, DENIED_HOST_SUFFIXES, DENIED_IPV4_CIDRS, DENIED_IPV6_CIDRS } from './network/consts.js'
import type { NetworkPolicy, NetworkPolicyOptions, ResolvedAddress } from './network/types.js'

const log = logger('file-streams:network')

export const createNetworkPolicy = (options: NetworkPolicyOptions = {}): NetworkPolicy => {
  const schemes = options.schemes ?? DEFAULT_SCHEMES

  const listOf = (cidrs: readonly string[]): BlockList => {
    const list = new BlockList()
    for (const cidr of cidrs) {
      const [address, prefix] = cidr.split('/')
      const family = isIP(address) === 6 ? 'ipv6' : 'ipv4'
      if (prefix == null) {
        list.addAddress(address, family)
      } else {
        list.addSubnet(address, Number(prefix), family)
      }
    }
    return list
  }

  const denied = listOf([...DENIED_IPV4_CIDRS, ...DENIED_IPV6_CIDRS])
  const extraDenied = listOf(options.denyCidrs ?? [])
  const allowed = listOf(options.allowCidrs ?? [])

  const ipv6Bytes = (address: string): number[] | undefined => {
    let text = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
    const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
    if (dotted != null) {
      const octets = dotted[1].split('.').map(Number)
      text = `${text.slice(0, -dotted[1].length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
    }
    const halves = text.split('::')
    if (halves.length > 2) {
      return undefined
    }
    const head = halves[0] === '' ? [] : halves[0].split(':')
    const tail = halves.length === 2 && halves[1] !== '' ? halves[1].split(':') : []
    const groups = halves.length === 2 ? [...head, ...new Array(8 - head.length - tail.length).fill('0'), ...tail] : head
    if (groups.length !== 8) {
      return undefined
    }

    return groups.flatMap(group => {
      const value = parseInt(group, 16)
      return [(value >> 8) & 0xff, value & 0xff]
    })
  }

  /** The IPv4 an IPv6 address carries: mapped, NAT64, 6to4, Teredo, IPv4-compatible. */
  const embeddedIpv4 = (address: string): string | undefined => {
    const bytes = ipv6Bytes(address)
    if (bytes == null) {
      return undefined
    }
    const quad = (offset: number, mask = 0): string => bytes.slice(offset, offset + 4).map(byte => byte ^ mask).join('.')
    const zeros = (from: number, to: number): boolean => bytes.slice(from, to).every(byte => byte === 0)
    if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
      return quad(12)
    }
    if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) {
      return quad(12)
    }
    if (bytes[0] === 0x20 && bytes[1] === 0x02) {
      return quad(2)
    }
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) {
      return quad(12, 0xff)
    }
    if (zeros(0, 12) && !zeros(12, 16)) {
      return quad(12)
    }

    return undefined
  }

  const allowsAddress = (address: string): boolean => {
    const family = isIP(address)
    if (family === 0) {
      return false
    }
    const type = family === 6 ? 'ipv6' : 'ipv4'
    if (allowed.check(address, type)) {
      return true
    }
    if (extraDenied.check(address, type)) {
      return false
    }
    if (options.allowPrivate === true) {
      return true
    }
    if (denied.check(address, type)) {
      return false
    }
    if (family === 6) {
      const inner = embeddedIpv4(address)
      if (inner != null) {
        return allowsAddress(inner)
      }
    }

    return true
  }

  const matches = (hostname: string, pattern: string): boolean => {
    const host = hostname.toLowerCase()
    const rule = pattern.toLowerCase()
    return rule.startsWith('*.') ? host.endsWith(rule.slice(1)) : host === rule
  }

  const hostOf = (url: URL): string => url.hostname.replace(/^\[|\]$/g, '')

  const assertUrl = (url: URL, from?: URL): void => {
    if (!schemes.includes(url.protocol)) {
      throw new NetworkPolicyError('scheme')
    }
    if ((url.username !== '' || url.password !== '') && options.allowUrlCredentials !== true) {
      throw new NetworkPolicyError('credentials')
    }
    if (from?.protocol === 'https:' && url.protocol === 'http:' && options.allowDowngrade !== true) {
      throw new NetworkPolicyError('downgrade')
    }
    const host = hostOf(url)
    if (options.allowHosts != null && !options.allowHosts.some(pattern => matches(host, pattern))) {
      throw new NetworkPolicyError('blocked-host')
    }
    if (options.denyHosts?.some(pattern => matches(host, pattern)) === true) {
      throw new NetworkPolicyError('blocked-host')
    }
    const port = url.port !== '' ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
    if (options.ports != null && !options.ports.includes(port)) {
      throw new NetworkPolicyError('port')
    }
  }

  const resolve = async (hostname: string, signal?: AbortSignal): Promise<ResolvedAddress[]> => {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const literal = isIP(host)
    let addresses: ResolvedAddress[]
    if (literal !== 0) {
      addresses = [{ address: host, family: literal as 4 | 6 }]
    } else {
      const explicitlyAllowed = options.allowHosts?.some(pattern => matches(host, pattern)) === true
      if (options.allowPrivate !== true && !explicitlyAllowed
        && DENIED_HOST_SUFFIXES.some(suffix => suffix.startsWith('.') ? host.endsWith(suffix) : host === suffix)) {
        log.warn('Refused an internal host name', { host }, { event: 'file-streams.policy.blocked' })
        throw new NetworkPolicyError('blocked-host')
      }
      try {
        addresses = options.resolver != null
          ? await options.resolver(host, signal)
          : (await lookup(host, { all: true, verbatim: true })).map(entry => ({ address: entry.address, family: entry.family as 4 | 6 }))
      } catch (error) {
        if (error instanceof NetworkPolicyError) {
          throw error
        }
        throw new NetworkPolicyError('unresolvable')
      }
    }
    if (addresses.length === 0) {
      throw new NetworkPolicyError('unresolvable')
    }
    if (addresses.some(entry => !allowsAddress(entry.address))) {
      log.warn('Refused a blocked address', { host }, { event: 'file-streams.policy.blocked' })
      throw new NetworkPolicyError('blocked-address')
    }

    return addresses
  }

  return { trustProxyDns: options.trustProxyDns === true, assertUrl, resolve, allowsAddress }
}

export const networkPolicy = createNetworkPolicy()
