import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGoogleDriveResolver, createPinnedFetch, NetworkPolicyError } from '../src/fetch.js'
import { noise, PNG } from './fixtures.js'
import { startFakeDrive } from './harness/drive.js'
import type { FakeDrive } from './harness/drive.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { LOCAL_NETWORK, localClient } from './context.js'

const TIMEOUTS = { connectMs: 3_000, headersMs: 3_000, idleMs: 3_000 }
const BUILD = fileURLToPath(new URL('../build/', import.meta.url))

/** Every module `entry` reaches by relative import, and every bare specifier those modules name. */
const importGraph = (entry: string): { files: string[], bare: Set<string> } => {
  const files: string[] = []
  const bare = new Set<string>()
  const visit = (file: string): void => {
    if (files.includes(file)) return
    files.push(file)
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1] ?? match[2] ?? match[3]!
      if (specifier.startsWith('.')) visit(resolve(dirname(file), specifier))
      else bare.add(specifier)
    }
  }
  visit(entry)
  return { files, bare }
}

describe('@owlmeans/file-streams — pinned fetch', () => {
  let origin: Origin
  let foreign: Origin
  let drive: FakeDrive
  const big = noise(6 * 1024 * 1024, 3)
  beforeAll(() => {
    origin = startOrigin()
    foreign = startOrigin()
    origin.files.set('big.bin', { bytes: big })
    origin.files.set('page.html', { bytes: Buffer.from('<h1>Hi</h1>'), type: 'text/html; charset=utf-8' })
    drive = startFakeDrive({ small: PNG, large: noise(300_000), docx: PNG, xlsx: PNG, pptx: PNG }, foreign)
  })
  afterAll(() => {
    origin.stop()
    foreign.stop()
    drive.stop()
  })

  const pinned = () => createPinnedFetch({ network: LOCAL_NETWORK, resolvers: [], timeouts: TIMEOUTS })

  test('answers like fetch: status, headers, url and body; any status is a Response', async () => {
    const page = await pinned()(origin.url('/files/page.html'), { headers: { 'x-trace': 't1' } })
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(page.url).toBe(origin.url('/files/page.html'))
    expect(await page.text()).toBe('<h1>Hi</h1>')
    expect(origin.requests.at(-1)!.headers['x-trace']).toBe('t1')

    const missing = await pinned()(origin.url('/status/404'))
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('status page')
    const head = await pinned()(origin.url('/files/page.html'), { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
    await expect(pinned()(origin.url('/files/page.html'), { method: 'POST' })).rejects.toThrow('http:method:POST')
  })

  test('redirect: manual returns the 3xx with its Location; follow (the default) goes on', async () => {
    const hop = await pinned()(origin.url('/redirect/2'), { redirect: 'manual' })
    expect(hop.status).toBe(302)
    expect(hop.headers.get('location')).toBe('/redirect/1')
    expect(hop.redirected).toBe(false)

    const followed = await pinned()(origin.url('/redirect/2'))
    expect(followed.status).toBe(200)
    expect(followed.redirected).toBe(true)
    expect(followed.url).toBe(origin.url('/redirect/0'))
    expect(await followed.text()).toBe('arrived')
    await expect(pinned()(origin.url('/redirect/1'), { redirect: 'error' })).rejects.toThrow('http:redirect')

    // The client itself: a 3xx returned under `manual`, any status under `anyStatus`.
    const client = localClient()
    const returned = await client.request(origin.url('/redirect/1'), { redirect: 'manual' })
    expect([returned.status, returned.headers.location, returned.redirects]).toEqual([302, '/redirect/0', 0])
    await expect(client.request(origin.url('/status/404'))).rejects.toThrow('http:status:404')
    expect((await client.request(origin.url('/status/404'), { anyStatus: true })).status).toBe(404)
  })

  test('private space is refused unless allowed — pinned at connect, so a name rebound to loopback is refused too', async () => {
    const strict = createPinnedFetch({ resolvers: [], timeouts: TIMEOUTS })
    const refusal = await strict(origin.url('/files/page.html')).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(NetworkPolicyError)
    expect((refusal as NetworkPolicyError).refused).toBe(true)

    // A name whose resolution turns private at connect time: the policy checks the address it dials.
    const rebound = createPinnedFetch({
      resolvers: [], timeouts: TIMEOUTS, network: { resolver: async () => [{ address: '127.0.0.1', family: 4 }] },
    })
    const port = new URL(origin.base).port
    await expect(rebound(`http://public.example:${port}/files/page.html`)).rejects.toBeInstanceOf(NetworkPolicyError)
    const allowed = createPinnedFetch({
      resolvers: [], timeouts: TIMEOUTS, network: { ...LOCAL_NETWORK, resolver: async () => [{ address: '127.0.0.1', family: 4 }] },
    })
    expect(await (await allowed(`http://public.example:${port}/files/page.html`)).text()).toBe('<h1>Hi</h1>')
  })

  test('the Google Drive resolver applies through the fetch', async () => {
    const fetch = createPinnedFetch({
      network: LOCAL_NETWORK, timeouts: TIMEOUTS,
      resolvers: [createGoogleDriveResolver({ origins: { drive: drive.base, usercontent: drive.base, docs: drive.base, accounts: drive.accounts } })],
    })
    const small = await fetch(`${drive.base}/file/d/SMALLFILE0001/view?usp=sharing`)
    expect(small.headers.get('content-disposition')).toContain('small.png')
    expect(new Uint8Array(await small.arrayBuffer())).toEqual(new Uint8Array(PNG))
    // The virus-scan page of a large file is followed inside the resolver, even for a manual caller.
    const large = await fetch(`${drive.base}/file/d/LARGEFILE0001/view`, { redirect: 'manual' })
    expect(new Uint8Array(await large.arrayBuffer())).toEqual(new Uint8Array(noise(300_000)))
  })

  test('a multi-megabyte body streams in chunks', async () => {
    const response = await pinned()(origin.url('/files/big.bin'))
    expect(Number(response.headers.get('content-length'))).toBe(big.length)
    const reader = response.body!.getReader()
    let size = 0
    let chunks = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      expect(Buffer.from(value).equals(big.subarray(size, size + value.byteLength))).toBe(true)
      size += value.byteLength
      chunks++
    }
    expect(size).toBe(big.length)
    expect(chunks).toBeGreaterThan(1)
  })

  test('an abort ends a request waiting for its head and a body in flight', async () => {
    const early = new AbortController()
    const waiting = pinned()(origin.url('/stall-headers'), { signal: early.signal })
    setTimeout(() => early.abort(new Error('stop-early')), 100)
    await expect(waiting).rejects.toThrow('stop-early')

    const late = new AbortController()
    const response = await pinned()(origin.url('/stall-body'), { signal: late.signal })
    const reader = response.body!.getReader()
    expect([...(await reader.read()).value!]).toEqual([1, 2, 3])
    late.abort(new Error('stop-late'))
    await expect(reader.read()).rejects.toThrow()
  })

  test('the ./fetch subpath never loads the AWS SDK, storage-resource or the S3 modules', () => {
    const { files, bare } = importGraph(join(BUILD, 'fetch.js'))
    expect(files.length).toBeGreaterThan(5)
    expect(files.some(file => /[\\/](s3|service|backed-workspace|workspace|transfer|archive)(\.js|[\\/])/.test(file.slice(BUILD.length)))).toBe(false)
    expect([...bare].filter(name => name.startsWith('@aws-sdk/') || name.startsWith('@owlmeans/storage-resource'))).toEqual([])
    expect([...bare].filter(name => !name.startsWith('node:')).sort()).toEqual(
      ['@owlmeans/error', '@owlmeans/file-inspector', '@owlmeans/log', '@owlmeans/storage-common', 'socks'],
    )
  })
})
