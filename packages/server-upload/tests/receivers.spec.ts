import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { UploadedFileStatus, UploadReason, UploadSessionStatus } from '@owlmeans/upload'
import type { UploadSession } from '@owlmeans/upload'
import { makeHarness } from './context.js'
import type { Harness } from './context.js'
import { archiveOf, ArchiveFormat, MARKDOWN, PNG, SVG } from './fixtures.js'

describe('@owlmeans/server-upload — receivers', () => {
  let h: Harness
  let session: UploadSession

  const send = async (path: string, body: Uint8Array) => await h.client.entrypoint(h.trees.forward.file).call({
    params: { project: session.id }, query: { path }, body,
  })

  beforeAll(async () => {
    h = await makeHarness('receivers')
    session = await h.client.entrypoint(h.trees.forward.open).call({ body: {} })
    // The receiving service keys its session by the same id (an application's own id, opened server-side).
    await h.remote.open({ id: session.id, scope: { organization: 'guest', purpose: `upload-${session.id}` } })
  })
  afterAll(async () => { await h?.close() })

  test('forwardingReceiver streams every accepted file to the second service, which verifies and keeps it', async () => {
    const md = (await send('docs/brief.md', MARKDOWN)).files[0]
    const png = (await send('brand/logo.png', PNG)).files[0]
    expect([md.status, png.status]).toEqual([UploadedFileStatus.Accepted, UploadedFileStatus.Accepted])

    const remote = await h.remote.get(session.id)
    expect(remote.files.map(file => [file.path, file.status, file.digest])).toEqual([
      ['docs/brief.md', UploadedFileStatus.Accepted, md.digest],
      ['brand/logo.png', UploadedFileStatus.Accepted, png.digest],
    ])
    expect(readFileSync(join(h.forwarded, session.id, 'brand/logo.png'))).toEqual(PNG)
    const local = await h.forward.get(session.id)
    expect(local.refs[png.id]).toBe(remote.files[1].id)
    expect(h.spooled()).toEqual([])
  })

  test('an archive is unpacked where it arrives; its entries travel one by one, a nested archive as a file', async () => {
    const zip = await archiveOf(ArchiveFormat.Zip, { 'kit/icon.svg': SVG, 'kit/more.zip': await archiveOf(ArchiveFormat.Zip, { 'a.md': MARKDOWN }) })
    const files = (await send('kit.zip', zip)).files
    expect(files.map(file => [file.path, file.status]).sort()).toEqual([
      ['kit/icon.svg', UploadedFileStatus.Accepted], ['kit/more.zip', UploadedFileStatus.Accepted],
    ])
    const remote = (await h.remote.get(session.id)).files.map(file => file.path)
    expect(remote).toContain('kit/icon.svg')
    expect(remote).toContain('kit/more.zip')
    expect(remote).not.toContain('a.md')
  })

  test('a rejection over there rejects the file here with the same reason and gives its room back', async () => {
    await h.remote.receive(session.id, { path: 'taken.md', stream: Readable.from([MARKDOWN]), length: MARKDOWN.length })
    const before = (await h.forward.get(session.id)).reserved

    const taken = (await send('taken.md', MARKDOWN)).files[0]
    expect(taken).toMatchObject({ status: UploadedFileStatus.Rejected, reason: UploadReason.Duplicate })
    expect((await h.forward.get(session.id)).reserved).toEqual(before)
  })

  test('remove and seal are mirrored on the second service', async () => {
    const local = await h.forward.get(session.id)
    const md = local.files.find(file => file.path === 'docs/brief.md')!
    await h.client.entrypoint(h.trees.forward.remove).call({ params: { project: session.id, file: md.id } })
    expect((await h.remote.get(session.id)).files.map(file => file.path)).not.toContain('docs/brief.md')

    const sealed = await h.client.entrypoint(h.trees.forward.seal).call({ params: { project: session.id } })
    expect(sealed.status).toBe(UploadSessionStatus.Sealed)
    expect((await h.remote.get(session.id)).status).toBe(UploadSessionStatus.Sealed)
  })
})
