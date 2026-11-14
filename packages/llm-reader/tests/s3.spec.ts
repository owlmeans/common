import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CollectKind, CollectStatus, createDirectoryCollectSink, createLlmReader, createS3UrlHelper } from '../src/index.js'
import type { CollectSink } from '../src/index.js'
import { gates, reason, titled } from './context.js'
import { startS3 } from './servers.js'

const s3 = startS3()
const bare = startS3({ markers: false })
const scratch = await mkdtemp(join(tmpdir(), 'llm-reader-s3-'))
afterAll(async () => {
  s3.stop()
  bare.stop()
  await rm(scratch, { recursive: true, force: true })
})

let dirs = 0
const target = (): { root: string, sink: CollectSink } => {
  const root = join(scratch, `run-${++dirs}`)
  return { root, sink: createDirectoryCollectSink(root) }
}
const files = async (root: string): Promise<string[]> =>
  (await readdir(root, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(root.length + 1)).sort()

/** `s3://` links go to the stand-in; any other S3-compatible endpoint is recognised from its answer. */
const reader = createLlmReader({ allowHosts: ['127.0.0.1'], timeout: 5000, s3: { endpoint: s3.url } })
// Reserved characters of a key become '_' on disk; the XML entities of the listing are decoded first.
const DOCS = ['a&b _odd_.txt', 'guide/intro.md', 'guide/setup.md', 'logo.svg', 'readme.md']

describe('@owlmeans/llm-reader — S3 source', () => {
  test('every URL style is read: s3://, AWS virtual-hosted and path-style, listings; website and presigned URLs are not', () => {
    const aws = createS3UrlHelper()
    expect(aws.parse('s3://my-bucket/docs/a b.md')).toEqual({ endpoint: 'https://s3.amazonaws.com', bucket: 'my-bucket', key: 'docs/a b.md', style: 'virtual', listing: false })
    expect(aws.parse('s3://my.bucket/docs/')).toMatchObject({ style: 'path', key: 'docs/' })
    expect(aws.parse('https://my-bucket.s3.eu-west-1.amazonaws.com/docs/a%20b.md'))
      .toEqual({ endpoint: 'https://s3.eu-west-1.amazonaws.com', bucket: 'my-bucket', key: 'docs/a b.md', style: 'virtual', region: 'eu-west-1', listing: false })
    expect(aws.parse('https://my-bucket.s3-us-west-2.amazonaws.com/k')).toMatchObject({ bucket: 'my-bucket', region: 'us-west-2', endpoint: 'https://s3-us-west-2.amazonaws.com' })
    expect(aws.parse('https://my-bucket.s3.amazonaws.com/')).toMatchObject({ bucket: 'my-bucket', key: '', style: 'virtual' })
    expect(aws.parse('https://s3.us-east-2.amazonaws.com/my-bucket/docs/')).toMatchObject({ bucket: 'my-bucket', key: 'docs/', style: 'path', region: 'us-east-2' })
    expect(aws.parse('https://s3.dualstack.ap-south-1.amazonaws.com/b/k')).toMatchObject({ bucket: 'b', region: 'ap-south-1' })
    expect(aws.parse('https://my-bucket.s3.amazonaws.com/?list-type=2&prefix=docs%2F')).toMatchObject({ key: 'docs/', listing: true })
    expect(aws.parse('https://my-bucket.s3-website-us-east-1.amazonaws.com/')).toBeUndefined()
    expect(aws.parse('https://my-bucket.s3.amazonaws.com/k?X-Amz-Signature=abc&X-Amz-Credential=c')).toBeUndefined()
    expect(aws.parse('https://example.com/bucket/key')).toBeUndefined()

    const virtual = aws.parse('https://my-bucket.s3.eu-west-1.amazonaws.com/docs/')!
    expect(aws.objectUrl(virtual, 'docs/a b.md')).toBe('https://my-bucket.s3.eu-west-1.amazonaws.com/docs/a%20b.md')
    expect(aws.listUrl(virtual, 'docs/', { token: 't', maxKeys: 5 })).toBe('https://my-bucket.s3.eu-west-1.amazonaws.com/?list-type=2&prefix=docs%2F&max-keys=5&continuation-token=t')
    const configured = createS3UrlHelper({ endpoints: ['https://s3.example.com'] })
    expect(configured.parse('https://s3.example.com/bucket/a/b.txt')).toMatchObject({ endpoint: 'https://s3.example.com', bucket: 'bucket', key: 'a/b.txt', style: 'path' })
    expect(configured.listUrl(configured.parse('https://s3.example.com/bucket/a/')!, 'a/')).toBe('https://s3.example.com/bucket?list-type=2&prefix=a%2F')
  })

  test('an s3:// prefix is every object under it, paths relative, across listing pages, folder markers left out', async () => {
    const { root, sink } = target()
    const before = s3.hits.length
    const result = await reader.collect('s3://public/docs/', { sink })
    expect(result).toMatchObject({ kind: CollectKind.Source, source: 's3', files: 5 })
    expect(await files(root)).toEqual(DOCS)
    expect(await readFile(join(root, 'guide/intro.md'), 'utf8')).toBe('# Intro')
    // Two keys a page: the listing took three pages.
    expect(s3.hits.slice(before).filter(hit => hit.includes('list-type=2'))).toHaveLength(3)
    expect(result.items.find(item => item.path === 'readme.md')).toMatchObject({ status: CollectStatus.Written, mime: 'text/markdown' })
  }, 30_000)

  test('a generic endpoint is recognised from its answer — by x-amz headers, or by the XML alone behind a CDN', async () => {
    for (const server of [s3, bare]) {
      const { root, sink } = target()
      const result = await reader.collect(`${server.url}/public/docs/`, { sink, prefix: 'links/01-docs' })
      expect(result).toMatchObject({ kind: CollectKind.Source, source: 's3', finalUrl: `${server.url}/public/docs/` })
      expect(await files(join(root, 'links/01-docs'))).toEqual(DOCS)
    }
    const { root, sink } = target()
    const listing = await reader.collect(`${bare.url}/public?list-type=2&prefix=docs/guide/`, { sink })
    expect(listing.kind).toBe(CollectKind.Source)
    expect(await files(root)).toEqual(['intro.md', 'setup.md'])
  }, 30_000)

  test('an object is one file; a key that lists children is a folder; a refused listing still downloads its object', async () => {
    const one = target()
    const object = await reader.collect('s3://public/docs/readme.md', { sink: one.sink })
    expect(object).toMatchObject({ kind: CollectKind.Source, entry: 'readme.md', files: 1 })

    const folder = target()
    await reader.collect('s3://public/docs/guide', { sink: folder.sink })
    expect(await files(folder.root)).toEqual(['intro.md', 'setup.md'])

    const locked = target()
    const plan = await reader.collect('s3://locked/secret/plan.md', { sink: locked.sink })
    expect(plan).toMatchObject({ entry: 'plan.md', files: 1 })
    expect(await readFile(join(locked.root, 'plan.md'), 'utf8')).toBe('# Plan')
    const refused = await reader.collect('s3://locked/secret/', { sink: locked.sink })
    expect(refused.items).toEqual([expect.objectContaining({ status: CollectStatus.Failed, reason: 'llm-reader:fetch:s3:listing-403:AccessDenied' })])
  }, 30_000)

  test('a listing stops at the file limit and reports the cut; a missing object and a presigned URL are files', async () => {
    const { sink } = target()
    const cut = await reader.collect('s3://public/docs/', { sink, limits: { maxFiles: 2 } })
    expect(cut.items.filter(item => item.status === CollectStatus.Written)).toHaveLength(2)
    expect(cut.items.filter(item => item.reason === 'max-files')).toHaveLength(1)

    const missing = await reader.collect('s3://public/docs/none.md', { sink })
    expect(missing.items).toEqual([expect.objectContaining({ status: CollectStatus.Failed, reason: 'status-404' })])
    const presigned = await reader.collect(`${s3.url}/public/docs/readme.md?X-Amz-Signature=abc&X-Amz-Credential=c`, { sink })
    expect(presigned).toMatchObject({ kind: CollectKind.File, entry: 'readme.md' })
  }, 30_000)
})

const liveSkip = reason(gates.s3)
const LIVE = 'https://s3-stage.owlmeans.link/vib-common-2-e2e-links'

describe('@owlmeans/llm-reader — S3 source, live', () => {
  test.skipIf(liveSkip != null)(titled('the public fixture bucket: an object, a folder link, a listing link', liveSkip), async () => {
    const live = createLlmReader({ timeout: 20_000 })
    const object = target()
    const pricing = await live.collect(`${LIVE}/public/crmore/crmore-pricing.md`, { sink: object.sink })
    expect(pricing).toMatchObject({ kind: CollectKind.File, entry: 'crmore-pricing.md', files: 1 })
    expect(pricing.items[0]?.mime).toBe('text/markdown')

    const folder = target()
    const crmore = await live.collect(`${LIVE}/public/crmore/`, { sink: folder.sink })
    expect(crmore).toMatchObject({ kind: CollectKind.Source, source: 's3' })
    expect(await files(folder.root)).toContain('crmore-pricing.md')

    const listing = target()
    const listed = await live.collect(`${LIVE}?list-type=2&prefix=public/crmore/`, { sink: listing.sink })
    expect(listed.kind).toBe(CollectKind.Source)
    expect(await files(listing.root)).toContain('crmore-pricing.md')

    const root = await live.collect(`${LIVE}/`, { sink: target().sink })
    expect(root.items).toEqual([expect.objectContaining({ status: CollectStatus.Failed, reason: expect.stringContaining('s3:listing-403') })])
  }, 90_000)
})
