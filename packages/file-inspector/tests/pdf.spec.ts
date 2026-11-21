import { describe, expect, test } from 'bun:test'
import { FileKind, FileMimicryError, fileInspector } from '../src/index.js'
import { sourceOf } from './context.js'
import {
  bytes, CLEAN_PDF, imagePdf, objectStreamPdf, paddedPdf, pdfOf, PIXELS_NAMING_JS, streamObject,
} from './fixtures.js'

describe('@owlmeans/file-inspector — active PDF', () => {
  test('passes a clean PDF and flags actions, scripts, embedded files and rich media, also #xx-escaped', async () => {
    const clean = await fileInspector.inspect(CLEAN_PDF, { name: 'invoice.pdf' }, { complete: true })
    expect(clean).toMatchObject({ status: 'match', dangerous: false, details: { pdf: { active: false, trailer: true } } })
    expect(fileInspector.enforce(clean, { allow: [FileKind.Pdf] })).toBe(clean)

    for (const active of [
      '<< /Type /Action /S /JavaScript /JS (app.alert(1)) >>',
      '<< /OpenAction << /S /Launch /F (calc.exe) >> >>',
      '<< /Type /Filespec /EF << /F 4 0 R >> /Type /EmbeddedFile >>',
      '<< /RichMedia 3 0 R >>',
      '<< /JS 7 0 R >>',
      '<< /S /J#61vaScript >>',
    ]) {
      const verdict = await fileInspector.inspect(pdfOf(`1 0 obj\n${active}\nendobj`), { name: 'x.pdf' }, { complete: true })
      expect({ active, dangerous: verdict.dangerous, flagged: verdict.details.pdf?.active, reason: verdict.reasons.includes('pdf-active') })
        .toEqual({ active, dangerous: true, flagged: true, reason: true })
    }
    const lookalike = await fileInspector.inspect(pdfOf('1 0 obj\n<< /JSON (a name that merely starts alike) >>\nendobj'), { name: 'x.pdf' }, { complete: true })
    expect(lookalike.dangerous).toBe(false)
  })

  test('finds JavaScript hidden in a FlateDecode object stream; an unreadable stream is not judged', async () => {
    const hidden = await fileInspector.inspect(objectStreamPdf('4 0 << /S /JavaScript /JS (app.alert(1)) >>'), { name: 'x.pdf' }, { complete: true })
    expect(hidden).toMatchObject({ status: 'match', dangerous: true, details: { pdf: { active: true } } })
    expect(() => fileInspector.enforce(hidden)).toThrow(FileMimicryError)

    expect((await fileInspector.inspect(objectStreamPdf('4 0 << /Type /Page >>'), { name: 'x.pdf' }, { complete: true })).dangerous).toBe(false)
    const encrypted = pdfOf(bytes('5 0 obj\n<< /Type /ObjStm /Filter /FlateDecode /Length 8 >>\nstream\n', [1, 2, 3, 4, 5, 6, 7, 8], '\nendstream\nendobj'))
    expect((await fileInspector.inspect(encrypted, { name: 'x.pdf' }, { complete: true })).dangerous).toBe(false)
  })

  test('a probe reads a PDF that fits its budget whole, a larger one by its head and tail', async () => {
    const midScript = Buffer.from(paddedPdf(300 * 1024))
    midScript.write('/JavaScript', 150 * 1024, 'latin1')
    const whole = await fileInspector.probe(sourceOf(midScript, { name: 'mid.pdf' }))
    expect(whole).toMatchObject({ dangerous: true, details: { pdf: { active: true, trailer: true } }, probe: { randomAccess: true } })

    const large = Buffer.from(paddedPdf(3 * 1024 * 1024, '9 0 obj\n<< /S /Launch /F (calc.exe) >>\nendobj'))
    const source = sourceOf(large, { name: 'large.pdf' })
    const tailed = await fileInspector.probe(source)
    expect(tailed).toMatchObject({ dangerous: true, details: { pdf: { active: true, trailer: true } } })
    expect(tailed.probe.bytesRead).toBeLessThanOrEqual(1024 * 1024)
    expect(source.served()).toBeLessThanOrEqual(1024 * 1024)

    // Past the budget and away from the head and tail, a script stays unseen — the verdict says what was read.
    const deep = Buffer.from(paddedPdf(3 * 1024 * 1024))
    deep.write('/JavaScript', 1536 * 1024, 'latin1')
    expect((await fileInspector.probe(sourceOf(deep, { name: 'deep.pdf' }))).details.pdf).toEqual({ active: false, trailer: true })
    expect((await fileInspector.inspect(deep, { name: 'deep.pdf' }, { complete: true })).details.pdf?.active).toBe(true)
  })

  test('a stream payload is never read as syntax for /JS — whole, probed or cut short', async () => {
    const image = imagePdf()
    const whole = await fileInspector.inspect(image, { name: 'printed.pdf' }, { complete: true })
    expect(whole).toMatchObject({ status: 'match', dangerous: false, details: { pdf: { active: false } } })
    expect(whole.reasons).not.toContain('pdf-active')
    expect((await fileInspector.probe(sourceOf(image, { name: 'printed.pdf' }))).dangerous).toBe(false)

    const cut = image.subarray(0, image.indexOf('/JS ') + 4)
    expect((await fileInspector.inspect(cut, { name: 'printed.pdf' })).details.pdf?.active).toBe(false)

    const tagged = pdfOf(streamObject(4, '/Length 22', '/JS BMC 0 0 m 1 1 l EMC'))
    expect((await fileInspector.inspect(tagged, { name: 'x.pdf' }, { complete: true })).dangerous).toBe(false)
    const tight = pdfOf(streamObject(4, '/Length 4', '/JS ', { gap: '', eol: '\r' }))
    expect((await fileInspector.inspect(tight, { name: 'x.pdf' }, { complete: true })).dangerous).toBe(false)
  })

  test('actions hidden around payloads stay found', async () => {
    const asActive = async (pdf: Uint8Array): Promise<boolean | undefined> =>
      (await fileInspector.inspect(pdf, { name: 'x.pdf' }, { complete: true })).details.pdf?.active

    // A reader finds an object by its offset, so a long name inside a fake payload still counts.
    const smuggled = pdfOf(streamObject(4, '/Length 9999', '7 0 obj\n<< /S /JavaScript /JS (go()) >>\nendobj'))
    expect(await asActive(smuggled)).toBe(true)
    // An `endstream` inside a payload ends it early: what follows is syntax again.
    expect(await asActive(pdfOf(streamObject(4, '/Length 40', 'xx\nendstream\n8 0 obj\n<< /JS 9 0 R >>')))).toBe(true)
    // A stream never closed in a whole file: what follows it is syntax.
    expect(await asActive(pdfOf(bytes('4 0 obj\n<< /Length 10 >>\nstream\n', PIXELS_NAMING_JS, '\n8 0 obj\n<< /JS 9 0 R >>')))).toBe(true)
    // An object stream after an image stream is still inflated and read.
    const packed = objectStreamPdf('4 0 << /S /JavaScript /JS (app.alert(1)) >>')
    expect(await asActive(Buffer.concat([imagePdf(), packed]))).toBe(true)
  })

  test('a tail that opens inside an image payload is read from its first endstream', async () => {
    const padding = paddedPdf(3 * 1024 * 1024)
    const pixels = Buffer.concat([Buffer.alloc(100 * 1024, 0x41), PIXELS_NAMING_JS, Buffer.alloc(1024, 0x41)])
    const image = Buffer.concat([
      padding.subarray(0, padding.length - 200 * 1024), Buffer.from('\n', 'latin1'),
      streamObject(9, `/Type /XObject /Subtype /Image /Length ${pixels.length}`, pixels),
      Buffer.from('trailer << /Root 1 0 R >>\n%%EOF\n', 'latin1'),
    ])
    const verdict = await fileInspector.probe(sourceOf(image, { name: 'large.pdf' }))
    expect(verdict.details.pdf).toEqual({ active: false, trailer: true })
  })

  test('a head-only probe scans the head it read', async () => {
    const script = pdfOf('1 0 obj\n<< /S /JavaScript /JS (go()) >>\nendobj')
    const verdict = await fileInspector.probe(sourceOf(script, { name: 'x.pdf', ranges: false }))
    expect(verdict).toMatchObject({ dangerous: true, probe: { randomAccess: false, complete: true }, details: { pdf: { active: true } } })
  })
})
