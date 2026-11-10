import { afterAll, describe, expect, test } from 'bun:test'
import {
  createPageFetcher, createProxyPlugin, ProxyStrategy, ReaderProxyError,
} from '../src/index.js'
import type { ProxyOutcome } from '../src/index.js'
import { deadPort, startHttpProxy, startSite, startSocksServer } from './servers.js'

const site = startSite()
const open = { username: 'alice', password: 's3cret' }
const proxyA = await startHttpProxy(open)
const proxyB = await startHttpProxy(open)
const socks = await startSocksServer(open)

afterAll(async () => {
  site.stop()
  await Promise.all([proxyA.stop(), proxyB.stop(), socks.stop()])
})

const reader = (plugin: ReturnType<typeof createProxyPlugin>) =>
  createPageFetcher({ allowHosts: ['127.0.0.1'], timeout: 5000, plugins: [plugin] })

const page = `${site.url}/stories/tide-pools-winter`

describe('@owlmeans/llm-reader — proxies', () => {
  test('an HTTP proxy with credentials carries the request; the response says which', async () => {
    const before = proxyA.hits.length
    const fetched = await reader(createProxyPlugin({ proxies: [proxyA.url] })).fetch({ url: page })

    expect(fetched.text).toContain('Tide Pools')
    expect(proxyA.hits.slice(before)).toEqual([`GET ${page}`])
    expect(fetched.via).toBe(`http://alice:***@127.0.0.1:${proxyA.port}`)
  }, 10_000)

  test('a SOCKS5 proxy with credentials carries it through the bridge', async () => {
    const before = socks.hits.length
    const plugin = createProxyPlugin({ proxies: [socks.url] })
    const fetched = await reader(plugin).fetch({ url: page })

    expect(fetched.text).toContain('Tide Pools')
    expect(socks.hits.slice(before)).toEqual([`CONNECT 127.0.0.1:${new URL(site.url).port}`])
    await plugin.close()
  }, 10_000)

  test('round-robin alternates; sticky keeps a key on one proxy', async () => {
    const a = proxyA.hits.length
    const b = proxyB.hits.length
    const fetcher = reader(createProxyPlugin({ proxies: [proxyA.url, proxyB.url] }))
    for (let i = 0; i < 4; i++) await fetcher.fetch({ url: page })
    expect([proxyA.hits.length - a, proxyB.hits.length - b]).toEqual([2, 2])

    const stickyFetcher = reader(createProxyPlugin({ proxies: [proxyA.url, proxyB.url], strategy: ProxyStrategy.Sticky }))
    const vias = new Set<string | undefined>()
    for (let i = 0; i < 4; i++) vias.add((await stickyFetcher.fetch({ url: page, key: 'tenant-42' })).via)
    expect(vias.size).toBe(1)
  }, 20_000)

  test('a resolver receives the request key and returns the proxy with its credentials', async () => {
    const seen: [string, string][] = []
    const before = proxyB.hits.length
    const fetcher = reader(createProxyPlugin({
      proxies: [proxyA.url],
      resolve: (key, info) => {
        seen.push([key, info.host])
        if (key === 'eu-customer') return { protocol: 'http', host: '127.0.0.1', port: proxyB.port, ...open }
        if (key === 'internal') return 'direct'
        return undefined
      },
    }))

    expect((await fetcher.fetch({ url: page, key: 'eu-customer' })).via).toContain(`:${proxyB.port}`)
    expect((await fetcher.fetch({ url: page, key: 'internal' })).via).toBeUndefined()
    expect((await fetcher.fetch({ url: page })).via).toContain(`:${proxyA.port}`)
    expect(seen).toEqual([['eu-customer', '127.0.0.1'], ['internal', '127.0.0.1'], ['127.0.0.1', '127.0.0.1']])
    expect(proxyB.hits.length - before).toBe(1)
  }, 15_000)

  test('a dead proxy fails over and cools down; a wrong password is a proxy failure', async () => {
    const dead = await deadPort()
    const outcomes: [string, ProxyOutcome][] = []
    const fetcher = reader(createProxyPlugin({
      proxies: [`http://127.0.0.1:${dead}`, proxyA.url], onOutcome: (id, outcome) => outcomes.push([id, outcome]),
    }))
    const fetched = await fetcher.fetch({ url: page })
    expect(fetched.via).toContain(`:${proxyA.port}`)
    expect(outcomes[0]![1].ok).toBe(false)
    expect(outcomes.at(-1)![1].ok).toBe(true)
    // The dead one is cooling down: the next request goes straight to the live one.
    outcomes.length = 0
    await fetcher.fetch({ url: page })
    expect(outcomes.map(([id]) => id)).toEqual([`http://127.0.0.1:${proxyA.port}`.replace('http://', 'http://alice:***@')])

    const refusedBefore = proxyB.refused
    const wrong = reader(createProxyPlugin({ proxies: [`http://alice:nope@127.0.0.1:${proxyB.port}`], attempts: 1 }))
    const error = await wrong.fetch({ url: page }).catch(e => e)
    expect(error).toBeInstanceOf(ReaderProxyError)
    expect(error.message).toContain('auth-required')
    expect(String(error.proxy)).not.toContain('nope')
    expect(proxyB.refused - refusedBefore).toBe(1)
  }, 20_000)

  test('a lease gives any client an HTTP endpoint — the upstream itself, or the bridge for SOCKS', async () => {
    const plugin = createProxyPlugin({ proxies: [socks.url] })
    const lease = await plugin.lease({ url: page })
    const endpoint = await lease!.endpoint()
    expect(endpoint.bridged).toBe(true)
    expect(endpoint.server).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const direct = await (await createProxyPlugin({ proxies: [proxyA.url] }).lease({ url: page }))!.endpoint()
    expect(direct).toMatchObject({ bridged: false, username: 'alice', password: 's3cret', server: `http://127.0.0.1:${proxyA.port}` })
    await plugin.close()
  }, 10_000)
})
