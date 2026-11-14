import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// The pinned fetch a consumer injects; llm-reader never depends on file-streams — only this spec reaches it.
import { createPinnedFetch } from '../../file-streams/src/fetch.js'
import {
  CollectKind, CollectStatus, createDirectoryCollectSink, createLlmReader, createProxyPlugin, ReaderConfigError, ReaderRefusedError,
} from '../src/index.js'
import { startCdn, startCollectSite, startHttpProxy, startS3, startSite } from './servers.js'

const site = startSite()
const cdn = startCdn('127.0.0.2')
const collectSite = startCollectSite(cdn.url)
const s3 = startS3({ markers: false })
const proxy = await startHttpProxy()
const scratch = await mkdtemp(join(tmpdir(), 'llm-reader-pinned-'))
afterAll(async () => {
  site.stop()
  cdn.stop()
  collectSite.stop()
  s3.stop()
  await proxy.stop()
  await rm(scratch, { recursive: true, force: true })
})

const timeouts = { connectMs: 3000, headersMs: 3000, idleMs: 3000 }
/** Pinned to loopback 127.0.0.1 only — the guard in front allows more, so a refusal here proves the fetch carried it. */
const pinned = createPinnedFetch({ network: { allowCidrs: ['127.0.0.1/32'] }, resolvers: [], timeouts })
const reader = createLlmReader({ fetch: pinned, allowHosts: ['127.0.0.1', '127.0.0.2'], timeout: 5000 })
let dirs = 0
const sink = () => createDirectoryCollectSink(join(scratch, `run-${++dirs}`))

describe('@owlmeans/llm-reader — an injected, pinned fetch', () => {
  test('every request goes through it: pages, redirects (each hop guarded), collected files', async () => {
    const echo = JSON.parse((await reader.fetcher.fetch({ url: `${site.url}/echo`, purpose: 'any', headers: { 'x-trace': 't' } })).text!) as { headers: Record<string, string> }
    // The pinned client's own wire shape — Bun's fetch would ask for compressed bodies.
    expect(echo.headers['accept-encoding']).toBe('identity')
    expect(echo.headers['x-trace']).toBe('t')
    expect(echo.headers['user-agent']).toContain('OwlMeansReader')

    const moved = await reader.fetch(`${site.url}/old-story`)
    expect(moved.redirects).toEqual([`${site.url}/old-story`])
    await expect(reader.fetch(`${site.url}/to-private`)).rejects.toThrow('non-public-address')
    const report = await reader.collect(`${collectSite.url}/to-report`, { sink: sink() })
    expect(report).toMatchObject({ kind: CollectKind.File, entry: 'Quarterly Report.pdf' })
  }, 30_000)

  test('what the guard lets through, the pinned connect can still refuse — reported as refused', async () => {
    const result = await reader.collect(`${collectSite.url}/`, { sink: sink() })
    const external = result.items.filter(item => item.url.startsWith(cdn.url))
    expect(external.length).toBeGreaterThan(0)
    expect(external.every(item => item.status === CollectStatus.Refused && item.reason!.includes('pinned:file-streams:policy:blocked-address'))).toBe(true)
    expect(result.items.find(item => item.url.endsWith('/css/site.css'))?.status).toBe(CollectStatus.Written)

    // A name the guard trusts that resolves into private space at connect time — a rebinding — is refused.
    const rebound = createPinnedFetch({ network: { resolver: async () => [{ address: '127.0.0.1', family: 4 }] }, resolvers: [], timeouts })
    const trusting = createLlmReader({ fetch: rebound, allowHosts: ['rebind.test'], timeout: 5000 })
    const port = new URL(site.url).port
    const refusal = await trusting.fetch(`http://rebind.test:${port}/`).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(ReaderRefusedError)
    expect((refusal as Error).message).toContain('pinned:')
  }, 30_000)

  test('S3 listings and objects travel through it too', async () => {
    const result = await reader.collect(`${s3.url}/public/docs/guide/`, { sink: sink() })
    expect(result).toMatchObject({ kind: CollectKind.Source, files: 2 })
  }, 30_000)

  test('an injected fetch does not take a reader proxy — proxies belong on the fetch', async () => {
    const proxied = createLlmReader({ fetch: pinned, plugins: [createProxyPlugin({ proxies: [proxy.url] })], allowHosts: ['127.0.0.1'] })
    await expect(proxied.fetch(`${site.url}/`)).rejects.toBeInstanceOf(ReaderConfigError)
  }, 30_000)
})
