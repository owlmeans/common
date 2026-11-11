import { describe, expect, test } from 'bun:test'
import { fileNameHelper } from '../src/index.js'

describe('@owlmeans/file-inspector — safe names', () => {
  test('keeps the base name only, without controls, bidi or unsafe characters', () => {
    expect(fileNameHelper.safe('../../etc/passwd.png', { ext: 'png' })).toBe('passwd.png')
    expect(fileNameHelper.safe('C:\\Users\\me\\My file (1).JPEG', { ext: 'jpg' })).toBe('My file (1).jpg')
    expect(fileNameHelper.safe('invoice\u202Efdp.exe', { ext: 'pdf' })).toBe('invoicefdp.pdf')
    expect(fileNameHelper.safe('<img src=x onerror=alert(1)>.txt', { ext: 'txt' })).toBe('_img src_x onerror_alert(1)_.txt')
    expect(fileNameHelper.safe('<b>x</b>.txt', { ext: 'txt' })).toBe('b_.txt')
    expect(fileNameHelper.safe('a\nb\tc.csv', { ext: 'csv' })).toBe('a b c.csv')
    expect(fileNameHelper.safe('zero\u200Bwidth\uFEFF.md')).toBe('zerowidth.md')
  })

  test('falls back when nothing is left and caps the length, extension included', () => {
    expect(fileNameHelper.safe('', { ext: 'gif', fallback: 'attachment' })).toBe('attachment.gif')
    expect(fileNameHelper.safe('...', { ext: 'gif', fallback: 'attachment' })).toBe('attachment.gif')
    expect(fileNameHelper.safe('.hidden', { ext: 'webp' })).toBe('hidden.webp')
    expect(fileNameHelper.safe('???')).toBe('___')
    expect(fileNameHelper.safe('/')).toBe('file')
    const long = fileNameHelper.safe(`${'x'.repeat(300)}.png`, { ext: 'png' })
    expect(long).toHaveLength(100)
    expect(long.endsWith('.png')).toBe(true)
    expect(fileNameHelper.safe(`${'y'.repeat(80)}.tar.gz`, { maxLength: 40 })).toBe(`${'y'.repeat(33)}.tar.gz`)
  })

  test('keeps the reported extension, lower-cased, when none is given', () => {
    expect(fileNameHelper.safe('Report Q3.PDF')).toBe('Report Q3.pdf')
    expect(fileNameHelper.safe('backup.TAR.GZ')).toBe('backup.tar.gz')
    expect(fileNameHelper.safe('Makefile')).toBe('Makefile')
    expect(fileNameHelper.safe('flow.drawio.svg')).toBe('flow.drawio.svg')
  })

  test('reads extensions of base names, compound ones kept', () => {
    expect(fileNameHelper.extOf('photo.JPG')).toBe('jpg')
    expect(fileNameHelper.extOf('dist/bundle.tar.gz')).toBe('tar.gz')
    expect(fileNameHelper.extOf('dir.v2/README')).toBeUndefined()
    expect(fileNameHelper.extOf('.env')).toBeUndefined()
    expect(fileNameHelper.extOf(undefined)).toBeUndefined()
  })
})
