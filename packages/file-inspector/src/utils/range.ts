import type { ITokenizer } from 'strtok3'
import { ProbeBudgetError } from '../errors.js'
import type { ProbeRangeReader } from '../types.js'
import { DEFAULT_BLOCK_SIZE, DEFAULT_MAX_BLOCKS } from './range/consts.js'
import { makeRangeTokenizer } from './range/tokenizer.js'
import type { CachedRangeOptions, CachedRangeReader, RangeUtils, TokenizerInfo } from './range/types.js'

export const createRangeUtils = (): RangeUtils => {
  const cached = (reader: ProbeRangeReader, options: CachedRangeOptions = {}): CachedRangeReader => {
    // A block never outgrows the budget, so a small budget still reads the head.
    const blockSize = Math.max(1, Math.min(options.blockSize ?? DEFAULT_BLOCK_SIZE, options.budget ?? Infinity))
    // Within a budget every fetched block stays cached: nothing is fetched twice, nothing re-counted.
    const maxBlocks = options.maxBlocks ?? Math.max(DEFAULT_MAX_BLOCKS, options.budget != null ? Math.ceil(options.budget / blockSize) : 0)
    const blocks = new Map<number, Promise<Uint8Array>>()
    let fetched = 0

    const block = (index: number, signal?: AbortSignal): Promise<Uint8Array> => {
      const known = blocks.get(index)
      if (known != null) {
        blocks.delete(index)
        blocks.set(index, known)
        return known
      }
      const start = index * blockSize
      const length = Math.min(blockSize, reader.size - start)
      if (options.budget != null && fetched + length > options.budget) {
        return Promise.reject(new ProbeBudgetError())
      }
      fetched += length
      const loading = reader.read(start, length, signal)
      loading.catch(() => blocks.delete(index))
      blocks.set(index, loading)
      while (blocks.size > maxBlocks) {
        blocks.delete(blocks.keys().next().value as number)
      }

      return loading
    }

    const read = async (offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> => {
      const end = Math.min(offset + length, reader.size)
      if (end <= offset) {
        return new Uint8Array(0)
      }
      const out = new Uint8Array(end - offset)
      for (let index = Math.floor(offset / blockSize); index * blockSize < end; index++) {
        const start = index * blockSize
        const bytes = await block(index, signal)
        const from = Math.max(offset, start)
        const to = Math.min(end, start + bytes.length)
        if (to > from) {
          out.set(bytes.subarray(from - start, to - start), from - offset)
        }
      }

      return out
    }

    return {
      size: reader.size,
      read,
      close: async () => {
        blocks.clear()
        await reader.close()
      },
      bytesRead: () => fetched,
    }
  }

  const tokenizer = (reader: ProbeRangeReader, info?: TokenizerInfo): ITokenizer => makeRangeTokenizer(reader, info)

  return { cached, tokenizer }
}

export const rangeUtils = createRangeUtils()
