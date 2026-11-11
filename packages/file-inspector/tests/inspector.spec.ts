import { describe, expect, test } from 'bun:test'
import { gzipSync } from 'node:zlib'
import { FileTypeError } from '@owlmeans/storage-common'
import { createFileInspector, FileKind, FileKindError, FileMimicryError, fileInspector } from '../src/index.js'
import { sourceOf } from './context.js'
import {
  ACTIVE_SVG, bigDocxOf, cfbOf, CLSID, CSV, docxOf, ELF, FLAC, GIF, HTML_ERROR, JPEG, JSON_TEXT, MARKDOWN, MP3, MP4, odtOf, OGG, PDF, PE,
  PLAIN, PNG, pptxOf, PY_CODE, SHEBANG, SVG, tarOf, TS_CODE, TSV, UTF16, WAV, WEBM, WEBP, xlsxOf, zipOf,
} from './fixtures.js'

describe('@owlmeans/file-inspector — inspector', () => {
  test('identifies images, audio, video, pdf, office, archives, csv, text and code', async () => {
    const tar = await tarOf([{ name: 'a.txt', data: 'a' }])
    const cases: Array<[string, Uint8Array, string, FileKind]> = [
      ['dot.png', PNG, 'png', FileKind.Image], ['photo.jpg', JPEG, 'jpg', FileKind.Image], ['anim.gif', GIF, 'gif', FileKind.Image],
      ['pic.webp', WEBP, 'webp', FileKind.Image], ['logo.svg', SVG, 'svg', FileKind.Image],
      ['song.mp3', MP3, 'mp3', FileKind.Audio], ['sound.wav', WAV, 'wav', FileKind.Audio], ['track.ogg', OGG, 'ogg', FileKind.Audio],
      ['lossless.flac', FLAC, 'flac', FileKind.Audio], ['clip.mp4', MP4, 'mp4', FileKind.Video], ['clip.webm', WEBM, 'webm', FileKind.Video],
      ['paper.pdf', PDF, 'pdf', FileKind.Pdf],
      ['letter.docx', await docxOf(), 'docx', FileKind.Document], ['table.xlsx', await xlsxOf(), 'xlsx', FileKind.Spreadsheet],
      ['deck.pptx', await pptxOf(), 'pptx', FileKind.Presentation], ['letter.odt', await odtOf(), 'odt', FileKind.Document],
      ['old.doc', cfbOf(CLSID.doc), 'doc', FileKind.Document], ['old.xls', cfbOf(CLSID.xls), 'xls', FileKind.Spreadsheet],
      ['old.ppt', cfbOf(CLSID.ppt), 'ppt', FileKind.Presentation],
      ['bundle.zip', await zipOf([{ name: 'a.txt', data: 'a' }]), 'zip', FileKind.Archive], ['bundle.tar', tar, 'tar', FileKind.Archive],
      ['bundle.tar.gz', gzipSync(tar), 'tar.gz', FileKind.Archive], ['note.txt.gz', gzipSync(Buffer.from('plain words')), 'gz', FileKind.Compressed],
      ['people.csv', CSV, 'csv', FileKind.Csv], ['people.tsv', TSV, 'tsv', FileKind.Csv], ['data.json', JSON_TEXT, 'json', FileKind.Text],
      ['readme.md', MARKDOWN, 'txt', FileKind.Text], ['notes.txt', PLAIN, 'txt', FileKind.Text], ['wide.txt', UTF16, 'txt', FileKind.Text],
      ['main.ts', TS_CODE, 'ts', FileKind.Code], ['main.py', PY_CODE, 'py', FileKind.Code], ['run.py', SHEBANG, 'py', FileKind.Code],
    ]
    for (const [name, data, ext, kind] of cases) {
      const verdict = await fileInspector.inspect(data, { name }, { complete: true })
      expect({ name, status: verdict.status, ext: verdict.detected?.ext, kind: verdict.detected?.kind })
        .toEqual({ name, status: 'match', ext, kind })
    }
    expect((await fileInspector.inspect(CSV, { name: 'people.csv' }, { complete: true })).details.csv).toEqual({ delimiter: ',', columns: 3 })
    expect((await fileInspector.inspect(UTF16, { name: 'wide.txt' }, { complete: true })).details.encoding).toBe('utf-16le')
    expect((await fileInspector.inspect(SHEBANG, { name: 'run.py' }, { complete: true })).details.language).toBe('python')
    expect((await fileInspector.inspect(PDF, { name: 'paper.pdf' }, { complete: true })).details.pdf).toEqual({ active: false, trailer: true })
  })

  test('catches files that mimic another type', async () => {
    const htmlAsPdf = await fileInspector.inspect(HTML_ERROR, { name: 'report.pdf', mime: 'application/pdf' }, { complete: true })
    expect(htmlAsPdf).toMatchObject({ status: 'mismatch', dangerous: false })
    expect(htmlAsPdf.reasons).toContain('html-error-page')
    expect(() => fileInspector.enforce(htmlAsPdf)).toThrow(FileMimicryError)

    const pngAsJpg = await fileInspector.inspect(PNG, { name: 'photo.jpg' }, { complete: true })
    expect(pngAsJpg.status).toBe('match')
    expect(pngAsJpg.details.formatDiffers).toEqual({ declared: 'jpg', detected: 'png' })
    expect(() => fileInspector.enforce(pngAsJpg, { strictFormat: true })).toThrow(FileMimicryError)

    for (const [name, data] of [['image.png', ELF], ['photo.jpg', PE], ['cat.png', SHEBANG]] as const) {
      const verdict = await fileInspector.inspect(data, { name }, { complete: true })
      expect({ name, dangerous: verdict.dangerous, status: verdict.status }).toEqual({ name, dangerous: true, status: 'mismatch' })
      expect(() => fileInspector.enforce(verdict, { refuseMismatch: false })).toThrow(FileTypeError)
    }
    expect((await fileInspector.inspect(SHEBANG, { name: 'cat.png' }, { complete: true })).detected?.ext).toBe('sh')

    const plainZip = await zipOf([{ name: 'a.txt', data: 'a' }])
    expect((await fileInspector.inspect(plainZip, { name: 'letter.docx' }, { complete: true })).status).toBe('mismatch')
    expect((await fileInspector.inspect(plainZip.subarray(0, 40), { name: 'letter.docx' })).reasons).toContain('head-only')
    expect((await fileInspector.inspect(PNG, { name: 'data.csv' }, { complete: true })).reasons).toContain('binary-as-text')
    expect((await fileInspector.inspect(PDF, { mime: 'image/png' }, { complete: true })).status).toBe('mismatch')
    expect((await fileInspector.inspect(ACTIVE_SVG, { name: 'logo.svg' }, { complete: true })).details.active).toBe(true)
  })

  test('applies a policy: allowed kinds, unclaimed bytes, inconclusive verdicts', async () => {
    const unclaimed = await fileInspector.inspect(PNG)
    expect(unclaimed.status).toBe('inconclusive')
    expect(unclaimed.reasons).toContain('no-claim')
    expect(fileInspector.enforce(unclaimed, { allow: [FileKind.Image] })).toBe(unclaimed)
    expect(() => fileInspector.enforce(unclaimed, { allow: [FileKind.Pdf] })).toThrow(FileKindError)
    expect(() => fileInspector.enforce(unclaimed, { refuseInconclusive: true })).toThrow(FileMimicryError)
    await expect(fileInspector.check(sourceOf(HTML_ERROR, { name: 'invoice.pdf' }))).rejects.toBeInstanceOf(FileTypeError)
    expect(fileInspector.kindOf('application/vnd.ms-excel')).toBe(FileKind.Spreadsheet)
    expect(fileInspector.kindOf('font/woff2')).toBe(FileKind.Font)
    expect(fileInspector.kindOf('model/gltf+json')).toBe(FileKind.Model3d)
    expect(fileInspector.kindOf('application/rss+xml')).toBe(FileKind.Text)
    expect(fileInspector.kindOf('application/x-deb')).toBe(FileKind.Executable)
    expect(fileInspector.normalizeMime('Image/JPG; q=1')).toBe('image/jpeg')
    expect(fileInspector.normalizeMime('application/octet-stream')).toBeUndefined()
  })

  test('probes through ranges within the budget, and heads without them', async () => {
    const big = sourceOf(await bigDocxOf(20 * 1024 * 1024), { name: 'big.docx' })
    const ranged = await fileInspector.probe(big)
    expect(ranged).toMatchObject({ status: 'match', detected: { ext: 'docx' }, probe: { randomAccess: true } })
    expect(ranged.probe.bytesRead).toBeLessThanOrEqual(1024 * 1024)
    expect(big.served()).toBeLessThan(2 * 1024 * 1024)

    const headOnly = await fileInspector.probe(sourceOf(await bigDocxOf(20 * 1024 * 1024), { name: 'big.docx', ranges: false }))
    expect(headOnly.probe.randomAccess).toBe(false)
    expect(headOnly.status).toBe('inconclusive')
    expect(headOnly.reasons).toContain('head-only')

    const small = createFileInspector({ sampleBytes: 4096 })
    expect((await small.probe(sourceOf(cfbOf(CLSID.doc, 40, 41), { name: 'deep.doc' }))).detected?.ext).toBe('doc')
    expect((await small.probe(sourceOf(cfbOf(CLSID.doc, 40, 41), { name: 'deep.doc', ranges: false }))).reasons).toContain('head-only')

    // A budget below one block still yields a verdict — the budget is a reason, never a rejection.
    const tight = await fileInspector.probe(sourceOf(await bigDocxOf(256 * 1024), { name: 'big.docx' }), { maxBytes: 2048 })
    expect(tight.probe.bytesRead).toBeLessThanOrEqual(2048)
    expect(tight.reasons).toContain('probe-budget')
  }, 60_000)
})
