import type { SinkInput, SinkResult, SinkWriteOptions } from '../types.js'
import { streamUtils } from '../utils/streams.js'
import { DEFAULT_BUFFER_SINK_BYTES } from './buffer/consts.js'
import type { BufferSink, BufferSinkOptions } from './buffer/types.js'

/** Collects a file in memory, refusing past its ceiling. */
export const createBufferSink = (options: BufferSinkOptions = {}): BufferSink => {
  let collected: Uint8Array = new Uint8Array(0)

  const write = async (input: SinkInput, writeOptions: SinkWriteOptions = {}): Promise<SinkResult> => {
    const ceiling = Math.min(options.maxBytes ?? DEFAULT_BUFFER_SINK_BYTES, writeOptions.maxBytes ?? Infinity)
    collected = await streamUtils.collect(input.stream, ceiling)

    return { kind: 'buffer', location: 'buffer', bytes: collected.length, mime: input.verdict?.detected?.mime ?? input.info.mime }
  }

  return { kind: 'buffer', write, bytes: () => collected }
}
