import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { apiStatusHelper } from '@owlmeans/api/status'
import { UploadedFileStatus, UploadReason, UploadSessionStatus } from '@owlmeans/upload'
import { chunked, makeHarness, ORG_A, until } from './context.js'
import type { Harness } from './context.js'
import { MARKDOWN, PNG } from './fixtures.js'

const statusOf = (error: unknown): number | null => apiStatusHelper.httpStatusOf(error)

describe('@owlmeans/server-upload — sessions', () => {
  let h: Harness

  const tree = () => h.trees.orgA
  const send = async (session: string, path: string, body: Uint8Array | Readable, extra: { size?: number, signal?: AbortSignal } = {}) =>
    await h.client.entrypoint(tree().file).call({
      params: { session }, query: { path, ...(extra.size != null ? { size: extra.size } : {}) }, body,
      ...(extra.signal != null ? { signal: extra.signal } : {}),
    })
  const params = (session: string) => ({ params: { session } })

  beforeAll(async () => { h = await makeHarness('sessions') })
  afterAll(async () => { await h?.close() })

  test('remove gives an accepted file\'s room back; an unknown file id answers the session unchanged', async () => {
    const session = await h.client.entrypoint(tree().open).call({ body: {} })
    const accepted = (await send(session.id, 'docs/a.md', MARKDOWN)).files[0]
    const rejected = (await send(session.id, 'docs/b.pdf', PNG)).files[0]
    expect(rejected.reason).toBe(UploadReason.TypeMismatch)

    expect(h.files(join(h.delivered, session.id))).toEqual(['docs/a.md'])
    const removed = await h.client.entrypoint(tree().remove).call({ params: { session: session.id, file: accepted.id } })
    expect(removed.totals).toEqual({ files: 0, bytes: 0 })
    expect(h.files(join(h.delivered, session.id))).toEqual([])
    expect(removed.files.map(file => file.id)).toEqual([rejected.id])
    expect((await h.service.get(session.id)).reserved).toEqual({ files: 0, bytes: 0 })

    const again = await h.client.entrypoint(tree().remove).call({ params: { session: session.id, file: accepted.id } })
    expect(again.files.map(file => file.id)).toEqual([rejected.id])
    // The path is free again.
    expect((await send(session.id, 'docs/a.md', MARKDOWN)).files[0].status).toBe(UploadedFileStatus.Accepted)
  })

  test('seal: idempotent, then no file, no removal and no abort; its spool folder is cleaned', async () => {
    const session = await h.client.entrypoint(tree().open).call({ body: {} })
    const file = (await send(session.id, 'x.md', MARKDOWN)).files[0]
    const scopeDir = join(h.root, ORG_A, `upload-${session.id}`)
    expect(existsSync(scopeDir)).toBe(true)

    const sealed = await h.client.entrypoint(tree().seal).call(params(session.id))
    expect(sealed).toMatchObject({ status: UploadSessionStatus.Sealed, totals: { files: 1, bytes: MARKDOWN.length } })
    expect(sealed.sealedAt).toBeString()
    expect((await h.client.entrypoint(tree().seal).call(params(session.id))).sealedAt).toBe(sealed.sealedAt)
    expect(existsSync(scopeDir)).toBe(false)

    expect(statusOf(await send(session.id, 'y.md', MARKDOWN).catch((error: unknown) => error))).toBe(409)
    expect(statusOf(await h.client.entrypoint(tree().remove).call({ params: { session: session.id, file: file.id } }).catch((error: unknown) => error))).toBe(409)
    expect(statusOf(await h.client.entrypoint(tree().abort).call(params(session.id)).catch((error: unknown) => error))).toBe(409)
  })

  test('abort: idempotent, then no file and no seal', async () => {
    const session = await h.client.entrypoint(tree().open).call({ body: {} })
    await send(session.id, 'x.md', MARKDOWN)

    const aborted = await h.client.entrypoint(tree().abort).call(params(session.id))
    expect(aborted.status).toBe(UploadSessionStatus.Aborted)
    expect((await h.client.entrypoint(tree().abort).call(params(session.id))).abortedAt).toBe(aborted.abortedAt)
    expect(statusOf(await send(session.id, 'y.md', MARKDOWN).catch((error: unknown) => error))).toBe(409)
    expect(statusOf(await h.client.entrypoint(tree().seal).call(params(session.id)).catch((error: unknown) => error))).toBe(409)
  })

  test('another organization is told a session does not exist — whatever it asks', async () => {
    const session = await h.client.entrypoint(tree().open).call({ body: {} })
    const other = h.trees.orgB
    expect(statusOf(await h.client.entrypoint(other.state).call(params(session.id)).catch((error: unknown) => error))).toBe(404)
    expect(statusOf(await h.client.entrypoint(other.file).call({ ...params(session.id), query: { path: 'a.md' }, body: MARKDOWN })
      .catch((error: unknown) => error))).toBe(404)
    expect(statusOf(await h.client.entrypoint(other.seal).call(params(session.id)).catch((error: unknown) => error))).toBe(404)
    expect(statusOf(await h.client.entrypoint(tree().state).call(params('missing-session')).catch((error: unknown) => error))).toBe(404)
    expect((await h.service.get(session.id)).files).toEqual([])
  })

  test('a client abort mid-upload releases the reservation and the spool; the next upload goes through', async () => {
    const session = await h.open()
    const abort = new AbortController()
    const call = send(session.id, 'slow.md', Readable.from(chunked(512 * 1024, 16 * 1024, 15, sent => {
      if (sent >= 64 * 1024) abort.abort()
    })), { size: 512 * 1024, signal: abort.signal })

    await expect(call).rejects.toBeDefined()
    await until(async () => {
      const state = await h.service.get(session.id)
      return state.reserved.files === 0 && state.pending.length === 0
    })
    expect((await h.service.get(session.id)).files).toEqual([])
    await until(() => h.spooled().length === 0)
    expect((await send(session.id, 'slow.md', MARKDOWN)).files[0].status).toBe(UploadedFileStatus.Accepted)
  })

  test('a session aborted while a file is in flight takes nothing from it', async () => {
    const session = await h.open()
    const call = send(session.id, 'late.md', Readable.from(chunked(256 * 1024, 16 * 1024, 10)), { size: 256 * 1024 })
      .catch((error: unknown) => error)
    await until(async () => (await h.service.get(session.id)).reserved.files === 1)
    await h.service.abort(session.id)

    expect(statusOf(await call)).toBe(409)
    const state = await h.service.get(session.id)
    expect(state.files).toEqual([])
    expect(h.files(join(h.delivered, session.id))).toEqual([])
  })
})
