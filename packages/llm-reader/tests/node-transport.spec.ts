import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { startHttpProxy, startSite, startSocksServer } from './servers.js'

/** The Node path (npm undici) never runs under `bun test`; this spec runs the built package in real Node. */
const node = Bun.which('node')
const built = existsSync(join(import.meta.dir, '..', 'build', 'index.js'))
const runtime = node != null ? (await Bun.$`${node} -p "process.versions.bun ? 'bun' : 'node'"`.quiet().nothrow()).stdout.toString().trim() : ''
const skip = node == null ? 'no node binary' : !built ? 'build/ missing — run `bun run build` first' : runtime !== 'node' ? `\`node\` is ${runtime}` : null

const site = startSite()
const credentials = { username: 'nodeuser', password: 'pw' }
const http = await startHttpProxy(credentials)
const socks = await startSocksServer(credentials)
afterAll(async () => {
  site.stop()
  await Promise.all([http.stop(), socks.stop()])
})

describe('@owlmeans/llm-reader — Node runtime', () => {
  test.skipIf(skip != null)(`HTTP and SOCKS proxies work under Node${skip != null ? ` — SKIPPED: ${skip}` : ''}`, async () => {
    const run = await Bun.$`${node!} ${join(import.meta.dir, 'node', 'transport.mjs')} ${site.url} ${http.url} ${socks.url}`.quiet().nothrow()
    const out = JSON.parse(run.stdout.toString().trim().split('\n').at(-1)!)

    expect(out.runtime).toBe('node')
    expect(out.http).toMatchObject({ status: 200, ok: true })
    expect(out.socks).toMatchObject({ status: 200, ok: true })
    expect(http.hits.at(-1)).toBe(`GET ${site.url}/stories/tide-pools-winter`)
    expect(socks.hits.at(-1)).toBe(`CONNECT 127.0.0.1:${new URL(site.url).port}`)
  }, 30_000)
})
