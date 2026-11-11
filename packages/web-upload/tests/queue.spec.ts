import { afterAll, describe, expect, test } from 'bun:test'
import { FileKind, UploadedFileStatus, UploadReason } from '@owlmeans/upload'
import {
  createUploadQueueStore, makeUploadText, uploadKindHelper, UploadEntryStatus, UploadRejectedBy,
} from '../src/index.js'
import type { UploadEntry, UploadPickedFile, UploadQueueStore } from '../src/index.js'
import { FAKE_PNG, MARKDOWN, PNG, TEXT, zipOf } from './fixtures.js'
import { HARNESS_POLICY, MiB } from './harness/tree.js'
import { closeUploadServer, uploadServer } from './server.js'

const picked = (path: string, body: Uint8Array | string, type = ''): UploadPickedFile =>
  ({ path, file: new File([body as BlobPart], path.split('/').at(-1)!, { type }) })

const bytes = (size: number): string => 'x'.repeat(size)

const byPath = (store: UploadQueueStore): Record<string, UploadEntry> =>
  Object.fromEntries(store.state().entries.map(entry => [entry.path, entry]))

afterAll(async () => { await closeUploadServer() })

describe('@owlmeans/web-upload — the queue', () => {
  test('prechecks what is added: per-entry reasons and limits, queue-wide violations, junk skipped; a removal re-checks', async () => {
    const store = createUploadQueueStore({ policy: { maxFiles: 3, maxFileBytes: 100, maxTotalBytes: 250 } })
    const added = await store.add([
      picked('a.md', bytes(50)), picked('big.md', bytes(150)), picked('docs/c.md', bytes(90)), picked('d.md', bytes(90)),
      picked('e.md', bytes(10)), picked('A.MD', bytes(10)), picked('../x.md', bytes(10)), picked('.DS_Store', bytes(5)),
      picked('__MACOSX/a.md', bytes(5)),
    ])

    expect(added.map(entry => entry.path)).toEqual(['a.md', 'big.md', 'docs/c.md', 'd.md', 'e.md', 'A.MD', '../x.md'])
    const entries = byPath(store)
    expect(entries['a.md']).toMatchObject({ status: UploadEntryStatus.Queued, name: 'a.md', size: 50, kind: FileKind.Text })
    expect(entries['docs/c.md']).toMatchObject({ status: UploadEntryStatus.Queued, name: 'c.md' })
    expect(entries['big.md']).toMatchObject({
      status: UploadEntryStatus.Rejected, rejectedBy: UploadRejectedBy.Precheck, reason: UploadReason.Limits, limit: 'file-bytes',
    })
    expect(entries['e.md']).toMatchObject({ status: UploadEntryStatus.Rejected, reason: UploadReason.Limits, limit: 'files' })
    expect(entries['A.MD']).toMatchObject({ status: UploadEntryStatus.Rejected, reason: UploadReason.Duplicate })
    expect(entries['../x.md']).toMatchObject({ status: UploadEntryStatus.Rejected, reason: UploadReason.PathInvalid })

    const state = store.state()
    expect(state.violations).toEqual([
      { code: 'max-files', limit: 3, actual: 4, entries: [entries['e.md'].id] },
      { code: 'max-file-bytes', limit: 100, actual: 150, entries: [entries['big.md'].id] },
    ])
    expect(state.totals).toMatchObject({
      pending: { files: 3, bytes: 230 }, rejected: 4, planned: { files: 3, bytes: 230 }, remaining: { files: 0, bytes: 20 },
    })

    await store.remove(entries['d.md'].id)
    expect(byPath(store)['e.md']).toMatchObject({ status: UploadEntryStatus.Queued, reason: undefined, limit: undefined })
    expect(store.state().violations.map(violation => violation.code)).toEqual(['max-file-bytes'])
  })

  test('a total-size refusal names its limit; a policy change re-checks, an equal one keeps the snapshot', async () => {
    const store = createUploadQueueStore({ policy: { maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 150 } })
    const seen: number[] = []
    const unsubscribe = store.subscribe(() => { seen.push(store.state().entries.length) })
    await store.add([picked('x.md', bytes(80)), picked('y.md', bytes(80))])

    expect(byPath(store)['y.md']).toMatchObject({ status: UploadEntryStatus.Rejected, limit: 'total-bytes' })
    expect(store.state().violations).toEqual([
      { code: 'max-total-bytes', limit: 150, actual: 160, entries: [byPath(store)['y.md'].id] },
    ])

    const before = store.state()
    store.configure({ policy: { maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 150 } })
    expect(store.state()).toBe(before)

    store.configure({ policy: { maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 200 } })
    expect(byPath(store)['y.md'].status).toBe(UploadEntryStatus.Queued)
    expect(store.state().violations).toEqual([])
    expect(seen).toEqual([2, 2])
    unsubscribe()
  })

  test('kinds are guessed from the name and type; the text speaks sizes, limits and reasons', () => {
    expect(uploadKindHelper.guess('Logo.PNG')).toBe(FileKind.Image)
    expect(uploadKindHelper.guess('site.tar.gz')).toBe(FileKind.Archive)
    expect(uploadKindHelper.guess('notes', 'text/plain')).toBe(FileKind.Text)
    expect(uploadKindHelper.guess('model.glb')).toBe(FileKind.Model3d)
    expect(uploadKindHelper.guess('blob')).toBe(FileKind.Other)

    const text = makeUploadText()
    expect(text.size(512)).toBe('512 B')
    expect(text.size(12 * MiB)).toBe('12 MB')
    expect(text.size(1536)).toBe('1.5 kB')
    expect(text.hints({ maxFiles: 50, maxFileBytes: 12 * MiB, maxTotalBytes: 50 * MiB }))
      .toBe('Limits — files: 50, one file: 12 MB, in total: 50 MB')
    const policy = { maxFiles: 3, maxFileBytes: 100, maxTotalBytes: 250 }
    const entry = (change: Partial<UploadEntry>): UploadEntry => ({
      id: 'a', path: 'a.md', name: 'a.md', size: 1, type: '', kind: FileKind.Text, status: UploadEntryStatus.Rejected, progress: 0,
      ...change,
    })
    expect(text.detail(entry({ reason: UploadReason.Limits, limit: 'file-bytes' }), policy)).toBe('Larger than 100 B, the limit for one file')
    expect(text.detail(entry({ reason: UploadReason.Limits, limit: 'files' }), policy)).toBe('Past the limit on the number of files: 3')
    expect(text.detail(entry({ reason: UploadReason.Dangerous, from: 'site.zip' }), policy))
      .toBe('Refused as potentially dangerous · From site.zip')
    expect(text.status(entry({ status: UploadEntryStatus.Uploading, progress: 0.4 }))).toBe('Uploading… 40%')
    expect(text.violation({ code: 'max-files', limit: 50, actual: 53, entries: [] })).toBe('Too many files: 53, at most 50')

    const german = makeUploadText((_key, fallback) => fallback, 'de')
    expect(german.size(1536)).toBe('1,5 kB')
    const translated = makeUploadText(key => key === 'totals' ? 'Pliki: {count} · {size}' : key, 'pl')
    expect(translated.totals({ files: 3, bytes: 2048 })).toBe('Pliki: 3 · 2 kB')
  })

  test('start uploads through the client: accepted, a type mismatch rejected, an archive expanded into its entries, progress', async () => {
    const server = await uploadServer()
    const store = createUploadQueueStore({ policy: HARNESS_POLICY, client: server.uploads, concurrency: 2 })
    const zip = await zipOf({ 'pages/home.md': MARKDOWN, 'pages/evil.png': FAKE_PNG })
    await store.add([
      picked('brief.md', MARKDOWN, 'text/markdown'), picked('brand/logo.png', PNG, 'image/png'),
      picked('brand/fake.png', FAKE_PNG, 'image/png'), picked('site.zip', zip, 'application/zip'),
      picked('big.md', TEXT(3 * MiB), 'text/markdown'),
    ])
    let partial = false
    let running = false
    const unsubscribe = store.subscribe(() => {
      const state = store.state()
      running ||= state.uploading && state.progress.count === 5
      partial ||= state.entries.some(entry => entry.status === UploadEntryStatus.Uploading && entry.progress > 0 && entry.progress < 1)
    })
    const session = await server.uploads.open()
    const settled = await store.start(session.id)
    unsubscribe()

    const entries = byPath(store)
    expect(Object.keys(entries).sort()).toEqual(['big.md', 'brand/fake.png', 'brand/logo.png', 'brief.md', 'pages/evil.png', 'pages/home.md'])
    expect(settled).toHaveLength(6)
    expect(entries['brief.md']).toMatchObject({ status: UploadEntryStatus.Accepted, kind: FileKind.Text, progress: 1 })
    expect(entries['brand/logo.png']).toMatchObject({ status: UploadEntryStatus.Accepted, kind: FileKind.Image })
    expect(entries['brand/fake.png']).toMatchObject({
      status: UploadEntryStatus.Rejected, rejectedBy: UploadRejectedBy.Server, reason: UploadReason.TypeMismatch,
    })
    expect(entries['pages/home.md']).toMatchObject({ status: UploadEntryStatus.Accepted, from: 'site.zip', file: undefined })
    expect(entries['pages/evil.png']).toMatchObject({ status: UploadEntryStatus.Rejected, reason: UploadReason.TypeMismatch, from: 'site.zip' })
    expect(entries['big.md'].status).toBe(UploadEntryStatus.Accepted)
    expect(running).toBe(true)
    expect(partial).toBe(true)
    const state = store.state()
    expect(state).toMatchObject({ uploading: false, sessionId: session.id, progress: { loaded: 0, total: 0, count: 0 } })
    expect(state.totals.accepted.files).toBe(4)

    const held = async (): Promise<string[]> => (await server.uploads.state(session.id)).files
      .filter(file => file.status === UploadedFileStatus.Accepted).map(file => file.path).sort()
    expect(await held()).toEqual(['big.md', 'brand/logo.png', 'brief.md', 'pages/home.md'])
    await store.remove(entries['brief.md'].id)
    await store.remove(entries['pages/home.md'].id)
    expect(await held()).toEqual(['big.md', 'brand/logo.png'])
    expect(Object.keys(byPath(store)).sort()).toEqual(['big.md', 'brand/fake.png', 'brand/logo.png', 'pages/evil.png'])
  }, 30_000)

  test('an aborted run puts its entries back in the queue; a failed run keeps them failed until the next start sends them', async () => {
    const server = await uploadServer()
    const store = createUploadQueueStore({ policy: HARNESS_POLICY, client: server.uploads })
    await store.add([picked('one.md', MARKDOWN), picked('two.png', PNG, 'image/png')])
    const session = await server.uploads.open()

    const aborted = store.start(session.id)
    store.abort()
    await aborted
    expect(store.state().entries.map(entry => entry.status)).toEqual([UploadEntryStatus.Queued, UploadEntryStatus.Queued])
    expect((await server.uploads.state(session.id)).files).toEqual([])

    await store.start('no-such-session')
    expect(store.state().entries.map(entry => entry.status)).toEqual([UploadEntryStatus.Failed, UploadEntryStatus.Failed])
    expect(store.state().entries[0].error).toBeDefined()
    expect(store.state().totals).toMatchObject({ failed: 2, pending: { files: 2 } })

    await store.start(session.id)
    expect(store.state().entries.map(entry => entry.status)).toEqual([UploadEntryStatus.Accepted, UploadEntryStatus.Accepted])
    expect(store.state().entries[0].error).toBeUndefined()

    store.clear()
    expect(store.state().entries).toEqual([])
    expect((await server.uploads.state(session.id)).totals.files).toBe(2)
  }, 30_000)

  test('without a client, start refuses', async () => {
    const store = createUploadQueueStore()
    await store.add([picked('a.md', MARKDOWN)])
    await expect(store.start('session')).rejects.toBeInstanceOf(SyntaxError)
  })
})
