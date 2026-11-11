import { archiveHelper, ArchiveFormat } from '@owlmeans/file-streams'
import type { FileSource } from '@owlmeans/file-streams'

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64',
)
export const MARKDOWN = Buffer.from('# Brief\n\nA landing page with a *hero* and a footer.\n')
/** Plain text under an image's name — a type mismatch the server refuses. */
export const FAKE_PNG = Buffer.from('this is not an image at all, just text\n')
export const TEXT = (length: number, fill = 'a'): Buffer => Buffer.from(fill.repeat(length))

const collect = async (source: FileSource): Promise<Buffer> => {
  const { stream } = await source.open()
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/** A zip packed by file-streams itself. */
export const zipOf = async (entries: Record<string, Uint8Array>): Promise<Buffer> =>
  await collect(archiveHelper.pack(ArchiveFormat.Zip, Object.entries(entries).map(([path, source]) => ({ path, source }))))
