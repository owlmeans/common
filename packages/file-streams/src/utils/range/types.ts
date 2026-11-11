import type { RandomAccessReader as ZipRandomAccessReader } from 'yauzl'
import type { RangeReader } from '../../types.js'

export interface RangeUtils {
  /** A yauzl random-access reader (central-directory zip reading) over a reader. */
  zipReader: (reader: RangeReader) => ZipRandomAccessReader
  /** A reader over bytes in memory. */
  ofBuffer: (bytes: Uint8Array) => RangeReader
  /** A reader over a regular file of known size. */
  ofFile: (path: string, size: number) => RangeReader
}
