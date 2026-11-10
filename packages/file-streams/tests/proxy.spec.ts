import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { addLogPlugin, configureLog, logConfig, memoryPlugin } from '@owlmeans/log'
import { createHttpProxyPlugin, ProxyError } from '../src/index.js'
import type { ProxyRequest } from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { startHttpProxy } from './harness/http-proxy.js'
import type { LocalHttpProxy } from './harness/http-proxy.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { startSocksProxy } from './harness/socks5.js'
import type { LocalSocksProxy } from './harness/socks5.js'
import { LOCAL_NETWORK, localClient, tlsMaterial } from './context.js'
import type { TlsMaterial } from './context.js'

const body = async (promise: Promise<{ body: import('node:stream').Readable }>): Promise<string> =>
  (await streamUtils.collect((await promise).body, 100_000)).toString()

describe('@owlmeans/file-streams — proxy plugins', () => {
  let origin: Origin
  let secure: Origin | undefined
  let tls: TlsMaterial | undefined
  let httpProxy: LocalHttpProxy
  let plainProxy: LocalHttpProxy
  let socks: LocalSocksProxy

  beforeAll(async () => {
    origin = startOrigin()
    origin.files.set('a.txt', { bytes: Buffer.from('through the proxy'), type: 'text/plain' })
    tls = await tlsMaterial()
    if (tls != null) {
      secure = startOrigin({ tls })
      secure.files.set('s.txt', { bytes: Buffer.from('tls inside the tunnel'), type: 'text/plain' })
    }
    httpProxy = await startHttpProxy({ username: 'proxy-user', password: 'proxy-secret' })
    plainProxy = await startHttpProxy()
    socks = await startSocksProxy({ username: 'socks-user', password: 'socks-secret' })
  })
  afterAll(() => {
    origin.stop()
    secure?.stop()
    httpProxy.stop()
    plainProxy.stop()
    socks.stop()
  })

  test('an HTTP proxy forwards plain-http targets and tunnels the checked IP with CONNECT', async () => {
    const forward = localClient({ proxies: { proxies: [`http://proxy-user:proxy-secret@127.0.0.1:${httpProxy.port}`] } })
    expect(await body(forward.request(origin.url('/files/a.txt')))).toBe('through the proxy')
    expect(httpProxy.records.at(-1)).toMatchObject({ method: 'GET', target: origin.url('/files/a.txt') })

    const port = new URL(origin.base).port
    const tunnel = localClient({
      network: { ...LOCAL_NETWORK, resolver: async () => [{ address: '127.0.0.1', family: 4 }] },
      proxies: {
        proxies: [`http://127.0.0.1:${httpProxy.port}`],
        credentials: () => ({ username: 'proxy-user', password: 'proxy-secret' }),
        plugins: [createHttpProxyPlugin({ httpTargets: 'connect' })],
      },
    })
    expect(await body(tunnel.request(`http://files.example:${port}/files/a.txt`))).toBe('through the proxy')
    expect(httpProxy.records.at(-1)).toMatchObject({ method: 'CONNECT', target: `127.0.0.1:${port}` })

    const denied = localClient({ proxies: { proxies: [`http://wrong:creds@127.0.0.1:${httpProxy.port}`], retries: 0 } })
    await expect(denied.request(origin.url('/files/a.txt'))).rejects.toBeInstanceOf(ProxyError)
    await expect(denied.request(origin.url('/files/a.txt'))).rejects.toThrow('proxy:')
  })

  test('SOCKS5 carries the checked IP; SOCKS5h hands the name to the proxy', async () => {
    const pinned = localClient({ proxies: { proxies: [`socks5://socks-user:socks-secret@127.0.0.1:${socks.port}`] } })
    expect(await body(pinned.request(origin.url('/files/a.txt')))).toBe('through the proxy')
    expect(socks.records.at(-1)).toMatchObject({ atyp: 1, address: '127.0.0.1', username: 'socks-user' })

    const remote = localClient({
      network: { allowCidrs: ['127.0.0.1/32', '::1/128'], allowHosts: ['localhost'] },
      proxies: { proxies: [`socks5h://socks-user:socks-secret@127.0.0.1:${socks.port}`] },
    })
    const port = new URL(origin.base).port
    expect(await body(remote.request(`http://localhost:${port}/files/a.txt`))).toBe('through the proxy')
    expect(socks.records.at(-1)).toMatchObject({ atyp: 3, address: 'localhost' })

    const wrong = localClient({ proxies: { proxies: [`socks5://socks-user:nope@127.0.0.1:${socks.port}`], retries: 0 } })
    await expect(wrong.request(origin.url('/files/a.txt'))).rejects.toBeInstanceOf(ProxyError)
  })

  test('pools rotate, fail over, stick by key; providers decide by key and URL; bypass goes direct', async () => {
    const dead = 'http://127.0.0.1:1'
    const failover = localClient({ proxies: { proxies: [dead, `http://127.0.0.1:${plainProxy.port}`], strategy: 'failover', retries: 1 } })
    expect(await body(failover.request(origin.url('/files/a.txt')))).toBe('through the proxy')

    const before = plainProxy.records.length + httpProxy.records.length
    const sticky = localClient({
      proxies: {
        proxies: [`http://127.0.0.1:${plainProxy.port}`, `http://proxy-user:proxy-secret@127.0.0.1:${httpProxy.port}`], strategy: 'by-key',
      },
    })
    const plainBefore = plainProxy.records.length
    for (let index = 0; index < 4; index++) {
      await body(sticky.request(origin.url('/files/a.txt'), { proxyKey: 'tenant-7' }))
    }
    const plainUsed = plainProxy.records.length - plainBefore
    expect(plainUsed === 0 || plainUsed === 4).toBe(true)
    expect(plainProxy.records.length + httpProxy.records.length - before).toBe(4)

    const asked: ProxyRequest[] = []
    const provided = localClient({
      proxies: {
        proxies: request => {
          asked.push(request)
          return request.key === 'direct' ? null : { type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'socks-user', password: 'socks-secret' }
        },
      },
    })
    const socksBefore = socks.records.length
    await body(provided.request(origin.url('/files/a.txt'), { proxyKey: 'via-socks' }))
    await body(provided.request(origin.url('/files/a.txt'), { proxyKey: 'direct' }))
    expect(socks.records.length - socksBefore).toBe(1)
    expect(asked.map(request => [request.key, request.url.pathname])).toEqual([['via-socks', '/files/a.txt'], ['direct', '/files/a.txt']])

    const bypassed = localClient({ proxies: { proxies: [dead], bypass: ['127.0.0.1'] } })
    expect(await body(bypassed.request(origin.url('/files/a.txt')))).toBe('through the proxy')
  })

  test('TLS rides inside both tunnels, and no proxy secret reaches the log', async () => {
    const previous = logConfig().level
    const memory = memoryPlugin('proxy-secrets')
    const remove = addLogPlugin(memory)
    configureLog({ level: 'debug' })
    try {
      const failing = localClient({ proxies: { proxies: ['http://user:leaked-secret@127.0.0.1:1', `socks5://u:other-secret@127.0.0.1:1`], retries: 1 } })
      const error = await failing.request(origin.url('/files/a.txt')).catch((failure: Error) => failure)
      expect(error).toBeInstanceOf(ProxyError)
      expect(String((error as Error).message)).not.toContain('secret')
      expect(JSON.stringify(memory.records)).not.toContain('secret')
    } finally {
      configureLog({ level: previous })
      remove()
    }

    if (secure == null || tls == null) {
      console.warn('openssl unavailable — HTTPS-through-proxy cases skipped')
      return
    }
    const viaConnect = localClient({ ca: tls.cert, proxies: { proxies: [`http://proxy-user:proxy-secret@127.0.0.1:${httpProxy.port}`] } })
    expect(await body(viaConnect.request(secure.url('/files/s.txt')))).toBe('tls inside the tunnel')
    expect(httpProxy.records.at(-1)?.method).toBe('CONNECT')
    const viaSocks = localClient({ ca: tls.cert, proxies: { proxies: [`socks5://socks-user:socks-secret@127.0.0.1:${socks.port}`] } })
    expect(await body(viaSocks.request(secure.url('/files/s.txt')))).toBe('tls inside the tunnel')
  })
})
