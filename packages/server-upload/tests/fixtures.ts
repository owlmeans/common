import { archiveHelper, ArchiveFormat } from '@owlmeans/file-streams'
import type { FileSource, PackEntry } from '@owlmeans/file-streams'

const bytes = (...parts: Array<number[] | string | Uint8Array>): Buffer => Buffer.concat(parts.map(part =>
  typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part)))

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64',
)
export const PDF = bytes('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')
export const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>')
export const MARKDOWN = Buffer.from('# Brief\n\nA landing page with a *hero* and a footer.\n')
export const TEXT = (length: number, fill = 'a'): Buffer => Buffer.from(fill.repeat(length))
export const ELF = bytes([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], new Uint8Array(56))
export const WASM = bytes([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00], new Uint8Array(24))

const collect = async (source: FileSource): Promise<Buffer> => {
  const { stream } = await source.open()
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/** An archive packed by file-streams itself. */
export const archiveOf = async (format: ArchiveFormat, entries: Record<string, Uint8Array>): Promise<Buffer> =>
  await collect(archiveHelper.pack(format, Object.entries(entries).map(([path, source]): PackEntry => ({ path, source }))))

export { ArchiveFormat }
