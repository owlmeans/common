import { constants, inflateSync } from 'node:zlib'
import { PDF_ACTIVE_NAMES, PDF_DICTIONARY_WINDOW, PDF_EOF_MARKER, PDF_INFLATE_LIMIT } from './consts.local.js'
import type { PdfScanner } from './types.local.js'

/** Active content in PDF bytes: actions, scripts, embedded files and rich media. */
export const createPdfScanner = (): PdfScanner => {
  const latin1Of = (bytes: Uint8Array): string =>
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1')

  /** A PDF name may spell any character as `#xx`; names are matched as a reader decodes them. */
  const decodeNames = (text: string): string =>
    text.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))

  const hasActiveName = (text: string): boolean => PDF_ACTIVE_NAMES.test(decodeNames(text))

  /**
   * The compressed object streams (`/Type /ObjStm`, FlateDecode) a PDF packs its dictionaries in —
   * where an action hides from a scan of the file's own text. Best effort: a stream that does not
   * inflate (an encrypted document, a stream cut by a partial read) is skipped; one that inflates
   * past the limit counts as active.
   */
  const activeObjectStream = (bytes: Uint8Array, text: string): boolean => {
    let at = text.indexOf('stream')
    while (at >= 0) {
      const next = at + 'stream'.length
      if (text.slice(Math.max(0, at - 3), at) !== 'end') {
        const before = text.slice(Math.max(0, at - PDF_DICTIONARY_WINDOW), at)
        const dictionary = decodeNames(before.slice(Math.max(0, before.lastIndexOf('obj'))))
        if (/\/ObjStm\b/.test(dictionary) && /\/FlateDecode\b/.test(dictionary)) {
          const start = text[next] === '\r' && text[next + 1] === '\n' ? next + 2 : text[next] === '\n' ? next + 1 : next
          const end = text.indexOf('endstream', start)
          if (end > start) {
            let inflated: Buffer | null = null
            try {
              inflated = inflateSync(bytes.subarray(start, end), { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: PDF_INFLATE_LIMIT })
            } catch (error) {
              if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
                return true
              }
            }
            if (inflated != null && hasActiveName(inflated.toString('latin1'))) {
              return true
            }
          }
        }
      }
      at = text.indexOf('stream', next)
    }

    return false
  }

  const isActive = (bytes: Uint8Array): boolean => {
    const text = latin1Of(bytes)

    return hasActiveName(text) || activeObjectStream(bytes, text)
  }

  const hasTrailer = (tail: Uint8Array): boolean => Buffer.from(tail.buffer, tail.byteOffset, tail.byteLength).includes(PDF_EOF_MARKER)

  return { isActive, hasTrailer }
}
