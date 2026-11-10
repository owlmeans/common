import { AbstractTokenizer, EndOfStreamError } from 'strtok3'
import type { IRandomAccessFileInfo, IRandomAccessTokenizer, IReadChunkOptions } from 'strtok3'
import type { RangeReader } from '../../types.js'
import type { TokenizerInfo } from './types.js'

/**
 * strtok3's tokenizer protocol is a class hierarchy: file-type and its detectors rely on
 * `AbstractTokenizer`'s option normalization and bound checks, so the random-access tokenizer is a
 * subclass rather than a closure object.
 */
class RangeTokenizer extends AbstractTokenizer implements IRandomAccessTokenizer {
  public fileInfo: IRandomAccessFileInfo

  private readonly reader: RangeReader

  constructor (reader: RangeReader, info: TokenizerInfo) {
    super()
    this.reader = reader
    this.fileInfo = { ...info, size: reader.size }
  }

  public override async readBuffer (buffer: Uint8Array, options?: IReadChunkOptions): Promise<number> {
    const normalized = this.normalizeOptions(buffer, options)
    const read = await this.peekBuffer(buffer, normalized)
    this.position = normalized.position + read

    return read
  }

  public override async peekBuffer (buffer: Uint8Array, options?: IReadChunkOptions): Promise<number> {
    const normalized = this.normalizeOptions(buffer, options)
    const available = Math.max(0, Math.min(this.reader.size - normalized.position, normalized.length))
    if (normalized.mayBeLess !== true && available < normalized.length) {
      throw new EndOfStreamError()
    }
    if (available === 0) {
      return 0
    }
    const bytes = await this.reader.read(normalized.position, available)
    const read = Math.min(bytes.length, available)
    buffer.set(bytes.subarray(0, read))
    if (normalized.mayBeLess !== true && read < normalized.length) {
      throw new EndOfStreamError()
    }

    return read
  }

  public override supportsRandomAccess (): boolean {
    return true
  }

  public setPosition (position: number): void {
    this.validateLength(position, 'position')
    this.position = position
  }
}

/** A random-access tokenizer over a reader. */
export const makeRangeTokenizer = (reader: RangeReader, info: TokenizerInfo = {}): IRandomAccessTokenizer =>
  new RangeTokenizer(reader, info)
