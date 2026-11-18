import { constants, inflateSync } from 'node:zlib'
import {
  PDF_ACTIVE_NAMES, PDF_EOF_MARKER, PDF_INFLATE_LIMIT, PDF_SHORT_ACTIVE_NAME, PDF_STREAM_END, PDF_STREAM_START,
} from './consts.local.js'
import type { PdfScanner } from './types.local.js'

/**
 * Active content in PDF bytes: actions, scripts, embedded files and rich media. The long names are
 * looked for everywhere; `/JS` only in the file's syntax — one walk splits it from the streams'
 * payloads — and in the dictionaries a FlateDecode object stream packs.
 */
export const createPdfScanner = (): PdfScanner => {
  const latin1Of = (bytes: Uint8Array): string =>
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')

  /** A PDF name may spell any character as `#xx`; names are matched as a reader decodes them. */
  const decodeNames = (text: string): string =>
    text.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))

  const named = (text: string, pattern: RegExp): boolean => pattern.test(decodeNames(text))

  /**
   * A FlateDecode object stream (`/Type /ObjStm`) holds dictionaries — where an action hides from a
   * scan of the file's syntax. Best effort: a payload that does not inflate (an encrypted document,
   * one cut by a partial read) is skipped; one that inflates past the limit counts as active.
   */
  const activeObjectStream = (dictionary: string, payload: Uint8Array): boolean => {
    const decoded = decodeNames(dictionary)
    if (!/\/ObjStm\b/.test(decoded) || !/\/FlateDecode\b/.test(decoded)) {
      return false
    }
    let inflated: Buffer
    try {
      inflated = inflateSync(payload, { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: PDF_INFLATE_LIMIT })
    } catch (error) {
      return (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
    }
    const text = inflated.toString('latin1')

    return named(text, PDF_ACTIVE_NAMES) || named(text, PDF_SHORT_ACTIVE_NAME)
  }

  const isActive: PdfScanner['isActive'] = (bytes, sample = {}) => {
    const text = latin1Of(bytes)
    if (named(text, PDF_ACTIVE_NAMES)) {
      return true
    }
    const starts = new RegExp(PDF_STREAM_START.source, 'g')
    let at = 0
    if (sample.fromStart === false) {
      // A sample from the middle may open inside a payload: up to its end, when no stream starts first.
      const end = text.indexOf(PDF_STREAM_END)
      const first = starts.exec(text)
      if (end >= 0 && (first == null || first.index > end)) {
        at = end + PDF_STREAM_END.length
      }
    }
    for (;;) {
      starts.lastIndex = at
      const start = starts.exec(text)
      const syntaxEnd = start == null ? text.length : start.index + start[0].length
      const syntax = text.slice(at, syntaxEnd)
      if (named(syntax, PDF_SHORT_ACTIVE_NAME)) {
        return true
      }
      if (start == null) {
        return false
      }
      const end = text.indexOf(PDF_STREAM_END, syntaxEnd)
      const dictionary = syntax.slice(Math.max(0, syntax.lastIndexOf('obj')))
      if (end < 0) {
        // Never closed: a sample cut short ends inside the payload; in a whole file the rest is syntax.
        if (activeObjectStream(dictionary, bytes.subarray(syntaxEnd))) {
          return true
        }
        return sample.toEnd !== false && named(text.slice(syntaxEnd), PDF_SHORT_ACTIVE_NAME)
      }
      if (activeObjectStream(dictionary, bytes.subarray(syntaxEnd, end))) {
        return true
      }
      at = end + PDF_STREAM_END.length
    }
  }

  const hasTrailer: PdfScanner['hasTrailer'] = tail =>
    Buffer.from(tail.buffer, tail.byteOffset, tail.byteLength).includes(PDF_EOF_MARKER)

  return { isActive, hasTrailer }
}
