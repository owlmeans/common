import { Transform } from 'node:stream'
import { LimitError } from '../errors.js'
import { RATIO_FLOOR_BYTES } from './consts.js'
import type { ArchiveLimits } from './types.js'
import type { RatioGuard } from './types.local.js'

/** Counts compressed input and decompressed output of one stream and refuses a bomb. */
export const makeRatioGuard = (limits: ArchiveLimits): RatioGuard => {
  let consumed = 0
  let produced = 0

  const input = new Transform({
    transform: (chunk: Buffer, _encoding, callback) => {
      consumed += chunk.length
      callback(null, chunk)
    },
  })

  const output = new Transform({
    transform: (chunk: Buffer, _encoding, callback) => {
      produced += chunk.length
      if (produced > limits.maxTotalBytes) {
        callback(new LimitError('total-bytes'))
        return
      }
      if (produced > RATIO_FLOOR_BYTES && produced > consumed * limits.maxRatio) {
        callback(new LimitError('ratio'))
        return
      }
      callback(null, chunk)
    },
  })

  return { input, output }
}
