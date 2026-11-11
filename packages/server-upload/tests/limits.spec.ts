import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import { apiStatusHelper } from '@owlmeans/api/status'
import { UploadedFileStatus, UploadReason } from '@owlmeans/upload'
import { chunked, makeHarness, MiB } from './context.js'
import type { Harness } from './context.js'
import { archiveOf, ArchiveFormat, MARKDOWN, TEXT } from './fixtures.js'

describe('@owlmeans/server-upload — limits', () => {
  let h: Harness

  const send = async (session: string, path: string, body: Uint8Array | Readable, size?: number) =>
    await h.client.entrypoint(h.trees.orgA.file).call({ params: { session }, query: { path, ...(size != null ? { size } : {}) }, body })

  beforeAll(async () => { h = await makeHarness('limits') })
  afterAll(async () => { await h?.close() })

  test('the file count: the file past maxFiles is rejected with limits', async () => {
    const session = await h.open({ maxFiles: 2 })
    expect((await send(session.id, 'a.md', MARKDOWN)).files[0].status).toBe(UploadedFileStatus.Accepted)
    expect((await send(session.id, 'b.md', MARKDOWN)).files[0].status).toBe(UploadedFileStatus.Accepted)
    expect((await send(session.id, 'c.md', MARKDOWN)).files[0]).toMatchObject({ status: UploadedFileStatus.Rejected, reason: UploadReason.Limits })
    expect((await h.service.get(session.id)).totals).toEqual({ files: 2, bytes: 2 * MARKDOWN.length })
  })

  test('one file over the route ceiling answers 413 — declared up front or crossed while streaming — and holds nothing', async () => {
    const session = await h.open()
    const declared = await send(session.id, 'big.md', TEXT(2 * MiB)).catch((error: unknown) => error)
    expect(apiStatusHelper.httpStatusOf(declared)).toBe(413)

    const streamed = await send(session.id, 'big-stream.md', Readable.from(chunked(2 * MiB, 64 * 1024))).catch((error: unknown) => error)
    expect(apiStatusHelper.httpStatusOf(streamed)).toBe(413)

    const state = await h.service.get(session.id)
    expect(state.reserved).toEqual({ files: 0, bytes: 0 })
    expect(state.pending).toEqual([])
    expect(state.files).toEqual([])
    expect(h.spooled()).toEqual([])
  })

  test('the total across parallel uploads is enforced exactly', async () => {
    const session = await h.open({ maxTotalBytes: 1000 })
    const results = await Promise.all(Array.from({ length: 10 }, async (_none, index) =>
      await send(session.id, `notes/${index}.md`, TEXT(300, String.fromCharCode(97 + index)))))
    const decided = results.map(result => result.files[0])

    expect(decided.filter(file => file.status === UploadedFileStatus.Accepted)).toHaveLength(3)
    expect(decided.filter(file => file.reason === UploadReason.Limits)).toHaveLength(7)
    const state = await h.service.get(session.id)
    expect(state.totals).toEqual({ files: 3, bytes: 900 })
    expect(state.reserved).toEqual({ files: 3, bytes: 900 })
    expect(state.pending).toEqual([])
  })

  test('archives count by their entries: entries past the count are rejected, an expansion past the total rejects the archive', async () => {
    const counted = await h.open({ maxFiles: 3 })
    const five = await archiveOf(ArchiveFormat.Zip, Object.fromEntries(['1', '2', '3', '4', '5'].map(name => [`n/${name}.md`, MARKDOWN])))
    const entries = (await send(counted.id, 'five.zip', five)).files
    expect(entries.filter(file => file.status === UploadedFileStatus.Accepted)).toHaveLength(3)
    expect(entries.filter(file => file.reason === UploadReason.Limits)).toHaveLength(2)

    const bounded = await h.open({ maxTotalBytes: 1000 })
    const large = await archiveOf(ArchiveFormat.Zip, { 'x/a.md': TEXT(600), 'x/b.md': TEXT(600) })
    expect(large.length).toBeLessThan(1000)
    const refused = (await send(bounded.id, 'large.zip', large)).files
    expect(refused).toEqual([expect.objectContaining({ path: 'large.zip', status: UploadedFileStatus.Rejected, reason: UploadReason.Limits })])
    expect((await h.service.get(bounded.id)).reserved).toEqual({ files: 0, bytes: 0 })
    expect(h.spooled()).toEqual([])
  })

  test('an announcement that cannot fit is refused at open (422)', async () => {
    const error = await h.client.entrypoint(h.trees.orgA.open).call({ body: { expect: { files: 51, bytes: 10 } } })
      .catch((caught: unknown) => caught)
    expect(apiStatusHelper.httpStatusOf(error)).toBe(422)
  })
})
