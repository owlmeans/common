import { logger } from '@owlmeans/log'
import { LimitError, WorkloadError } from '../errors.js'
import type { FileSink, SinkInput, SinkResult, SinkWriteOptions, TreeSink } from '../types.js'
import { pathUtils } from '../utils/paths.js'
import { streamUtils } from '../utils/streams.js'
import { WORKLOAD_MAX_FILE_BYTES } from './workload/consts.js'
import type { WorkloadSinkOptions, WorkloadWriter } from './workload/types.js'

const log = logger('file-streams:workload')

/**
 * Files written into a Viable ephemeral workload through its writer: one atomic write per file,
 * each at most 12 MiB (the publisher's base64 ceiling) or a lower `maxFileBytes`.
 */
export const makeWorkloadSink = (writer: WorkloadWriter, options: WorkloadSinkOptions = {}): TreeSink => {
  const ceiling = Math.min(options.maxFileBytes ?? WORKLOAD_MAX_FILE_BYTES, WORKLOAD_MAX_FILE_BYTES)
  const root = options.root != null && options.root.replace(/^\/+|\/+$/g, '') !== '' ? pathUtils.entry(options.root) : ''
  const retries = options.retries ?? 1

  const entry = (path: string): FileSink => {
    const filePath = root === '' ? pathUtils.entry(path) : `${root}/${pathUtils.entry(path)}`

    const write = async (input: SinkInput, writeOptions: SinkWriteOptions = {}): Promise<SinkResult> => {
      const limit = Math.min(ceiling, writeOptions.maxBytes ?? Infinity)
      if (input.info.size != null && input.info.size > limit) {
        streamUtils.discard(input.stream)
        throw new WorkloadError('too-large')
      }
      let bytes: Buffer
      try {
        bytes = await streamUtils.collect(input.stream, limit)
      } catch (error) {
        throw error instanceof LimitError ? new WorkloadError('too-large') : error
      }
      const base64 = bytes.toString('base64')

      for (let attempt = 0; ; attempt++) {
        writeOptions.signal?.throwIfAborted()
        try {
          await writer.writeBinaryFile(filePath, base64)
          break
        } catch (error) {
          if (attempt >= retries) {
            log.warn('Workload write failed', { bytes: bytes.length, attempts: attempt + 1 })
            throw new WorkloadError('write-failed')
          }
        }
      }

      return { kind: 'workload', location: filePath, bytes: bytes.length, mime: input.verdict?.detected?.mime ?? input.info.mime }
    }

    return { kind: 'workload', write }
  }

  const directory = async (): Promise<void> => undefined

  return { kind: 'workload', entry, directory }
}
