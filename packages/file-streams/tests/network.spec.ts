import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHttpClient, createNetworkPolicy, NetworkPolicyError } from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { LOCAL_NETWORK, localClient } from './context.js'

describe('@owlmeans/file-streams — network policy', () => {
  let origin: Origin
  beforeAll(() => { origin = startOrigin() })
  afterAll(() => origin.stop())

  test('refuses internal, special and embedded addresses; allows public ones', () => {
    const policy = createNetworkPolicy()
    const refused = [
      '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.4', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
      '240.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fd00::1', 'fe80::1', 'ff02::1', '::ffff:10.0.0.1',
      '::ffff:7f00:1', '64:ff9b::a00:1', '2002:c0a8:0101::1', '2001:0:0:0:0:0:f5ff:fffe', 'not-an-ip',
    ]
    for (const address of refused) {
      expect(policy.allowsAddress(address), address).toBe(false)
    }
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '64:ff9b::808:808']) {
      expect(policy.allowsAddress(address), address).toBe(true)
    }
    expect(createNetworkPolicy({ allowCidrs: ['127.0.0.1/32'] }).allowsAddress('127.0.0.1')).toBe(true)
    expect(createNetworkPolicy({ denyCidrs: ['8.8.8.0/24'] }).allowsAddress('8.8.8.8')).toBe(false)
  })

  test('checks schemes, credentials, hosts, ports and downgrades before any DNS', () => {
    const policy = createNetworkPolicy({ ports: [80, 443], denyHosts: ['*.evil.test'] })
    const cases: Array<[string, string, string?]> = [
      ['ftp://example.com/x', 'scheme'],
      ['file:///etc/passwd', 'scheme'],
      ['https://user:pass@example.com/', 'credentials'],
      ['https://cdn.evil.test/', 'blocked-host'],
      ['https://example.com:8443/', 'port'],
      ['http://example.com/', 'downgrade', 'https://example.com/'],
    ]
    for (const [url, reason, from] of cases) {
      expect(() => policy.assertUrl(new URL(url), from != null ? new URL(from) : undefined), url).toThrow(`policy:${reason}`)
    }
    expect(() => policy.assertUrl(new URL('https://example.com/a'))).not.toThrow()
    expect(() => createNetworkPolicy({ allowHosts: ['*.example.com'] }).assertUrl(new URL('https://other.test/'))).toThrow('policy:blocked-host')
  })

  test('the default client refuses a loopback origin before sending a byte', async () => {
    origin.files.set('a.txt', { bytes: Buffer.from('a') })
    const before = origin.requests.length
    await expect(createHttpClient().request(origin.url('/files/a.txt'))).rejects.toThrow('policy:blocked-address')
    await expect(createHttpClient().request(`http://2130706433:${new URL(origin.base).port}/files/a.txt`)).rejects.toThrow('policy:blocked-address')
    await expect(createHttpClient().request('http://localhost/')).rejects.toThrow('policy:blocked-host')
    await expect(createHttpClient().request('http://metadata.google.internal/')).rejects.toThrow('policy:blocked-host')
    expect(origin.requests.length).toBe(before)
  })

  test('connects to the address it checked and refuses a mixed answer or a refused redirect', async () => {
    origin.files.set('pinned.txt', { bytes: Buffer.from('pinned') })
    const port = new URL(origin.base).port
    const resolved: string[] = []
    const pinned = localClient({
      network: { ...LOCAL_NETWORK, resolver: async host => { resolved.push(host); return [{ address: '127.0.0.1', family: 4 }] } },
    })
    const response = await pinned.request(`http://files.example:${port}/headers`)
    const echoed = JSON.parse((await streamUtils.collect(response.body, 10_000)).toString()) as Record<string, string>
    expect(echoed.host).toBe(`files.example:${port}`)
    expect(resolved).toEqual(['files.example'])

    const mixed = localClient({
      network: { ...LOCAL_NETWORK, resolver: async () => [{ address: '127.0.0.1', family: 4 }, { address: '10.0.0.7', family: 4 }] },
    })
    await expect(mixed.request(`http://files.example:${port}/files/pinned.txt`)).rejects.toBeInstanceOf(NetworkPolicyError)

    const before = origin.requests.length
    await expect(localClient().request(origin.url(`/go?to=${encodeURIComponent('http://169.254.169.254/latest/meta-data')}`)))
      .rejects.toThrow('policy:blocked-address')
    expect(origin.requests.length).toBe(before + 1)
  })
})
