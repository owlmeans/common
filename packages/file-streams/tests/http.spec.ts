import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { gzipSync } from 'node:zlib'
import { HttpError, LimitError, SourceError } from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { startOrigin, startRawServer } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { localClient } from './context.js'
import { noise } from './fixtures.js'

describe('@owlmeans/file-streams — HTTP client', () => {
  let origin: Origin
  let other: Origin
  beforeAll(() => {
    origin = startOrigin()
    other = startOrigin()
    origin.files.set('report.pdf', {
      bytes: Buffer.from('%PDF-1.4 body %%EOF'), type: 'application/pdf; charset=binary',
      disposition: 'attachment; filename="fallback.pdf"; filename*=UTF-8\'\'r%C3%A9sum%C3%A9.pdf',
    })
    origin.files.set('big.bin', { bytes: noise(300_000) })
  })
  afterAll(() => {
    origin.stop()
    other.stop()
  })

  test('answers info from the response and reads ranges where the server serves them', async () => {
    const client = localClient()
    const response = await client.request(origin.url('/files/report.pdf'))
    expect(response.info).toMatchObject({ name: 'résumé.pdf', size: 19, mime: 'application/pdf' })
    expect((await streamUtils.collect(response.body, 100)).toString()).toBe('%PDF-1.4 body %%EOF')
    const head = await client.request(origin.url('/files/report.pdf'), { method: 'HEAD' })
    expect(head.status).toBe(200)

    const ranged = client.source(origin.url('/files/big.bin'))
    const reader = await ranged.ranges()
    expect(reader?.size).toBe(300_000)
    expect(Buffer.from(await reader!.read(1000, 16)).equals(noise(300_000).subarray(1000, 1016))).toBe(true)
    expect(await client.source(origin.url('/norange/big.bin')).ranges()).toBeNull()

    origin.files.set('changing.bin', { bytes: noise(1000), etag: '"v1"' })
    const changing = client.source(origin.url('/files/changing.bin'))
    const changingReader = await changing.ranges()
    origin.files.set('changing.bin', { bytes: noise(1000, 2), etag: '"v2"' })
    await expect(changingReader!.read(0, 10)).rejects.toBeInstanceOf(SourceError)
  })

  test('follows redirects within limits and drops credentials on another origin', async () => {
    const client = localClient()
    const arrived = await client.request(origin.url('/redirect/3'))
    expect(arrived.redirects).toBe(3)
    expect((await streamUtils.collect(arrived.body, 100)).toString()).toBe('arrived')
    await expect(client.request(origin.url('/redirect/9'))).rejects.toThrow('http:redirects')

    const headers = { authorization: 'Bearer secret', cookie: 'sid=1', 'x-api-key': 'k' }
    const sensitive = localClient({ sensitiveHeaders: ['x-api-key'] })
    const crossed = await sensitive.request(origin.url(`/go?to=${encodeURIComponent(other.url('/headers'))}`), { headers })
    const seen = JSON.parse((await streamUtils.collect(crossed.body, 10_000)).toString()) as Record<string, string>
    expect(seen.authorization).toBeUndefined()
    expect(seen.cookie).toBeUndefined()
    expect(seen['x-api-key']).toBeUndefined()

    const same = await sensitive.request(origin.url('/go?to=/headers'), { headers })
    const kept = JSON.parse((await streamUtils.collect(same.body, 10_000)).toString()) as Record<string, string>
    expect(kept.authorization).toBe('Bearer secret')
  })

  test('decodes transport gzip but never a gzip file, and refuses truncated bodies', async () => {
    origin.files.set('page.txt', { bytes: Buffer.from('hello '.repeat(100)), type: 'text/plain' })
    origin.files.set('bundle.tar.gz', { bytes: Buffer.from('tar bytes'), type: 'application/gzip' })
    const client = localClient()
    const page = await client.request(origin.url('/gzip/page.txt'))
    expect((await streamUtils.collect(page.body, 10_000)).toString()).toBe('hello '.repeat(100))
    const bundle = await client.request(origin.url('/gzip/bundle.tar.gz'))
    expect(await streamUtils.collect(bundle.body, 10_000)).toEqual(gzipSync(Buffer.from('tar bytes')))

    const raw = await startRawServer('HTTP/1.1 200 OK\r\nContent-Length: 100\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n0123456789')
    try {
      const truncated = await client.request(`${raw.base}/x`)
      await expect(streamUtils.collect(truncated.body, 1000)).rejects.toThrow()
    } finally {
      raw.stop()
    }
  })

  test('times out, aborts and reports statuses', async () => {
    const client = localClient({ timeouts: { headersMs: 300, idleMs: 300 } })
    await expect(client.request(origin.url('/stall-headers'))).rejects.toThrow('http:headers-timeout')
    const stalled = await client.request(origin.url('/stall-body'))
    await expect(streamUtils.collect(stalled.body, 1000)).rejects.toBeInstanceOf(LimitError)

    const controller = new AbortController()
    const pending = client.request(origin.url('/stall-headers'), { signal: controller.signal })
    controller.abort(new Error('caller gave up'))
    await expect(pending).rejects.toThrow('caller gave up')

    const missing = client.request(origin.url('/status/404'))
    await expect(missing).rejects.toBeInstanceOf(HttpError)
    await missing.catch((error: HttpError) => expect(error.status).toBe(404))
  })
})
