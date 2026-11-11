import { afterAll, describe, expect, test } from 'bun:test'
import { connect } from 'node:net'
import { BRIDGE_ERROR_HEADER, createSocksBridge } from '../src/index.js'
import { deadPort, startSite, startSocksServer } from './servers.js'

const site = startSite()
const credentials = { username: 'bob', password: 'pw' }
const socks = await startSocksServer(credentials)
const bridge = createSocksBridge()

afterAll(async () => {
  site.stop()
  await socks.stop()
  await bridge.close()
})

/** Speak to the bridge by hand: one request head, the raw answer back. */
const raw = (port: number, head: string, after?: string): Promise<string> => new Promise((resolve, reject) => {
  const socket = connect(port, '127.0.0.1', () => socket.write(head))
  let out = ''
  let tunnelled = false
  socket.on('data', chunk => {
    out += chunk.toString('latin1')
    if (after != null && !tunnelled && out.includes('\r\n\r\n')) {
      tunnelled = true
      socket.write(after)
    }
  })
  socket.on('end', () => resolve(out))
  socket.on('error', reject)
  setTimeout(() => { socket.destroy(); resolve(out) }, 3000)
})

const siteHost = new URL(site.url).host

describe('@owlmeans/llm-reader — SOCKS bridge', () => {
  for (const protocol of ['socks5', 'socks5h', 'socks4', 'socks4a'] as const) {
    test(`${protocol}: a CONNECT tunnel reaches the target`, async () => {
      const endpoint = await bridge.endpoint({ protocol, host: '127.0.0.1', port: socks.port, ...credentials })
      const port = Number(new URL(endpoint.server).port)
      const auth = Buffer.from(`${endpoint.username}:${endpoint.password}`).toString('base64')
      const answer = await raw(port,
        `CONNECT ${siteHost} HTTP/1.1\r\nHost: ${siteHost}\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`,
        `GET /topics HTTP/1.1\r\nHost: ${siteHost}\r\nConnection: close\r\n\r\n`)

      expect(answer).toStartWith('HTTP/1.1 200 Connection Established')
      expect(answer).toContain('<h1>Topics</h1>')
    }, 10_000)
  }

  test('an absolute-form request is forwarded with the proxy headers stripped', async () => {
    const endpoint = await bridge.endpoint({ protocol: 'socks5', host: '127.0.0.1', port: socks.port, ...credentials })
    const auth = Buffer.from(`${endpoint.username}:${endpoint.password}`).toString('base64')
    const answer = await raw(Number(new URL(endpoint.server).port),
      `GET ${site.url}/echo HTTP/1.1\r\nHost: ${siteHost}\r\nProxy-Authorization: Basic ${auth}\r\nX-Trace: t2\r\n\r\n`)
    expect(answer).toContain('"x-trace":"t2"')
    expect(answer).not.toContain('proxy-authorization')
  }, 10_000)

  test('no or wrong credentials get a 407 challenge; a dead upstream a marked 502', async () => {
    const endpoint = await bridge.endpoint({ protocol: 'socks5', host: '127.0.0.1', port: socks.port, ...credentials })
    const port = Number(new URL(endpoint.server).port)
    const challenge = await raw(port, `CONNECT ${siteHost} HTTP/1.1\r\n\r\n`)
    expect(challenge).toStartWith('HTTP/1.1 407')
    expect(challenge.toLowerCase()).toContain('proxy-authenticate: basic')
    const forged = Buffer.from(`${endpoint.username}:not-the-secret`).toString('base64')
    expect(await raw(port, `CONNECT ${siteHost} HTTP/1.1\r\nProxy-Authorization: Basic ${forged}\r\n\r\n`)).toStartWith('HTTP/1.1 407')

    const dead = await bridge.endpoint({ protocol: 'socks5', host: '127.0.0.1', port: await deadPort() })
    const auth = Buffer.from(`${dead.username}:${dead.password}`).toString('base64')
    const failed = await raw(port, `CONNECT ${siteHost} HTTP/1.1\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`)
    expect(failed).toStartWith('HTTP/1.1 502')
    expect(failed.toLowerCase()).toContain(BRIDGE_ERROR_HEADER)
  }, 10_000)
})
