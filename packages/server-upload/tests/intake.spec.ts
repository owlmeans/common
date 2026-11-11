import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FileKind, UploadedFileStatus, UploadReason } from '@owlmeans/upload'
import type { UploadSession } from '@owlmeans/upload'
import { makeHarness } from './context.js'
import type { Harness } from './context.js'
import { archiveOf, ArchiveFormat, ELF, MARKDOWN, PDF, PNG, SVG, WASM } from './fixtures.js'

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

describe('@owlmeans/server-upload — the intake of one session', () => {
  let h: Harness
  let session: UploadSession

  const send = async (path: string, body: Uint8Array, type?: string) => await h.client.entrypoint(h.trees.orgA.file).call({
    params: { session: session.id }, query: { path, ...(type != null ? { type } : {}) }, body,
  })

  beforeAll(async () => {
    h = await makeHarness('intake')
    session = await h.client.entrypoint(h.trees.orgA.open).call({ body: {} })
  })
  afterAll(async () => { await h?.close() })

  test('png, md, pdf and svg are accepted under their original paths, verified and handed to the receiver', async () => {
    const cases: Array<[string, Uint8Array, FileKind]> = [
      ['brand/Logo (final).png', PNG, FileKind.Image],
      ['docs/brief.md', MARKDOWN, FileKind.Text],
      ['docs/spec.pdf', PDF, FileKind.Pdf],
      ['brand\\icon.svg', SVG, FileKind.Image],
    ]
    for (const [path, body, kind] of cases) {
      const { files } = await send(path, body)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatchObject({
        path: path.replace('\\', '/'), name: path.split(/[\\/]/).pop(), size: body.length, status: UploadedFileStatus.Accepted,
        digest: sha256(body),
      })
      expect([kind, FileKind.Code]).toContain(files[0].kind as FileKind)
      expect(readFileSync(join(h.delivered, session.id, files[0].path))).toEqual(Buffer.from(body))
    }

    const state = await h.client.entrypoint(h.trees.orgA.state).call({ params: { session: session.id } })
    expect(state.totals).toEqual({ files: 4, bytes: PNG.length + MARKDOWN.length + PDF.length + SVG.length })
    expect(state.files.map(file => file.path)).toEqual(['brand/Logo (final).png', 'docs/brief.md', 'docs/spec.pdf', 'brand/icon.svg'])
    expect(state).not.toHaveProperty('scope')
    expect(state).not.toHaveProperty('reserved')
    expect(h.spooled()).toEqual([])
  })

  test('a png named .pdf is rejected as a mismatch: its spool is gone and the refusal logged without contents', async () => {
    h.memory.clear()
    const { files } = await send('docs/fake.pdf', PNG, 'application/pdf')

    expect(files[0]).toMatchObject({ path: 'docs/fake.pdf', status: UploadedFileStatus.Rejected, reason: UploadReason.TypeMismatch, kind: FileKind.Image })
    expect(h.spooled()).toEqual([])
    expect(h.files(join(h.delivered, session.id))).not.toContain('docs/fake.pdf')
    const record = h.memory.records.find(line => line.message === 'Upload refused')
    expect(record).toMatchObject({ level: 'error', scope: 'server-upload:intake', event: 'upload.refused' })
    expect(record?.data).toMatchObject({
      session: session.id, path: 'docs/fake.pdf', reason: UploadReason.TypeMismatch,
      declared: { ext: 'pdf', mime: 'application/pdf' }, detected: { ext: 'png', kind: FileKind.Image },
    })
    expect(JSON.stringify(record?.data)).not.toContain(PNG.toString('base64').slice(0, 16))
  })

  test('executable content is refused — ELF under an image claim as dangerous, an honest wasm as a refused kind', async () => {
    const elf = await send('assets/photo.png', ELF)
    expect(elf.files[0]).toMatchObject({ status: UploadedFileStatus.Rejected, reason: UploadReason.Dangerous })

    const wasm = await send('lib/module.wasm', WASM)
    expect(wasm.files[0]).toMatchObject({ status: UploadedFileStatus.Rejected, reason: UploadReason.RefusedKind })

    const bare = await send('bin/tool', ELF)
    expect(bare.files[0]).toMatchObject({ status: UploadedFileStatus.Rejected, reason: UploadReason.RefusedKind })
    expect(h.spooled()).toEqual([])
  })

  test('a zip and a tar.gz are unpacked with their folders kept; a bad entry is rejected while the others pass', async () => {
    const zip = await archiveOf(ArchiveFormat.Zip, {
      'site/index.md': MARKDOWN, 'site/img/hero.png': PNG, 'site/img/fake.png': PDF, 'site/nested.zip': await archiveOf(ArchiveFormat.Zip, { 'x.md': MARKDOWN }),
    })
    const unpacked = await send('materials/site.zip', zip)
    const byPath = Object.fromEntries(unpacked.files.map(file => [file.path, file]))
    expect(Object.keys(byPath).sort()).toEqual([
      'materials/site/img/fake.png', 'materials/site/img/hero.png', 'materials/site/index.md', 'materials/site/nested.zip',
    ])
    expect(byPath['materials/site/img/fake.png']).toMatchObject({ status: UploadedFileStatus.Rejected, reason: UploadReason.TypeMismatch, from: 'materials/site.zip' })
    expect(byPath['materials/site/img/hero.png']).toMatchObject({ status: UploadedFileStatus.Accepted, from: 'materials/site.zip', digest: sha256(PNG) })
    expect(byPath['materials/site/index.md']).toMatchObject({ status: UploadedFileStatus.Accepted, size: MARKDOWN.length })
    // A nested archive stays a file.
    expect(byPath['materials/site/nested.zip']).toMatchObject({ status: UploadedFileStatus.Accepted, kind: FileKind.Archive })

    const tgz = await archiveOf(ArchiveFormat.TarGz, { 'pack/a.md': MARKDOWN, 'pack/deep/b.svg': SVG, 'pack/run.png': ELF })
    const extracted = await send('bundle.tar.gz', tgz)
    expect(extracted.files.map(file => [file.path, file.status, file.reason ?? null]).sort()).toEqual([
      ['pack/a.md', UploadedFileStatus.Accepted, null],
      ['pack/deep/b.svg', UploadedFileStatus.Accepted, null],
      ['pack/run.png', UploadedFileStatus.Rejected, UploadReason.Dangerous],
    ])

    const delivered = h.files(join(h.delivered, session.id))
    expect(delivered).toContain('materials/site/img/hero.png')
    expect(delivered).toContain('pack/deep/b.svg')
    expect(delivered).not.toContain('materials/site.zip')
    expect(delivered).not.toContain('bundle.tar.gz')
    expect(h.spooled()).toEqual([])
  })

  test('paths are kept as named, a path that climbs out or carries controls is rejected, a taken one is a duplicate', async () => {
    const traversal = await send('../etc/passwd.md', MARKDOWN)
    expect(traversal.files[0]).toMatchObject({ status: UploadedFileStatus.Rejected, reason: UploadReason.PathInvalid })
    const control = await send('docs/evil‮name.md', MARKDOWN)
    expect(control.files[0]).toMatchObject({ status: UploadedFileStatus.Rejected, reason: UploadReason.PathInvalid })
    const duplicate = await send('DOCS/Brief.md', MARKDOWN)
    expect(duplicate.files[0]).toMatchObject({ status: UploadedFileStatus.Rejected, reason: UploadReason.Duplicate })

    const unicode = await send('./Документы/план Q3 (v2).md', MARKDOWN)
    expect(unicode.files[0]).toMatchObject({ path: 'Документы/план Q3 (v2).md', name: 'план Q3 (v2).md', status: UploadedFileStatus.Accepted })
  })
})
