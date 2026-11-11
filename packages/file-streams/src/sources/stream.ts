import { SourceError } from '../errors.js'
import type { FileInfo, FileSource, OpenedFile } from '../types.js'
import { nameUtils } from '../utils/names.js'
import { streamUtils } from '../utils/streams.js'
import type { SourceClaims, StreamInput } from './types.js'

/** A stream someone else opened: one-shot, without random access. */
export const createStreamSource = (input: StreamInput, claims: SourceClaims = {}): FileSource => {
  const known: FileInfo = { origin: 'stream', name: nameUtils.sanitize(claims.name), size: claims.size, mime: claims.mime }
  let consumed = false

  const info = async (): Promise<FileInfo> => known

  const open = async (): Promise<OpenedFile> => {
    if (consumed) {
      throw new SourceError('consumed')
    }
    consumed = true

    return { stream: streamUtils.toReadable(input), info: known }
  }

  const ranges = async (): Promise<null> => null

  return { kind: 'stream', info, open, ranges }
}
