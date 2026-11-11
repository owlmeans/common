import { describe, expect, test } from 'bun:test'
import { FileKind, FileMimicryError, fileInspector } from '../src/index.js'
import { sourceOf } from './context.js'
import { bytes, CLEAN_PDF, objectStreamPdf, paddedPdf, pdfOf } from './fixtures.js'

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

  test('a head-only probe scans the head it read', async () => {
    const script = pdfOf('1 0 obj\n<< /S /JavaScript /JS (go()) >>\nendobj')
    const verdict = await fileInspector.probe(sourceOf(script, { name: 'x.pdf', ranges: false }))
    expect(verdict).toMatchObject({ dangerous: true, probe: { randomAccess: false, complete: true }, details: { pdf: { active: true } } })
  })
})
