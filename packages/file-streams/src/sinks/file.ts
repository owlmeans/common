import { randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { chmod, link, mkdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { logger } from '@owlmeans/log'
import { PathError } from '../errors.js'
import type { FileSink, SinkInput, SinkResult, SinkWriteOptions } from '../types.js'
import { streamUtils } from '../utils/streams.js'
import type { FileSinkOptions } from './types.js'

const log = logger('file-streams:file')

/** One file on disk, written to a private temporary file and committed atomically. */
export const createFileSink = (path: string, options: FileSinkOptions = {}): FileSink => {
  const write = async (input: SinkInput, writeOptions: SinkWriteOptions = {}): Promise<SinkResult> => {
    const dir = dirname(path)
    if (options.mkdirs !== false) {
      await mkdir(dir, { recursive: true, mode: 0o755 })
    }
    const temporary = join(dir, `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`)
    const meter = streamUtils.meter({ maxBytes: writeOptions.maxBytes })

    try {
      await pipeline(
        input.stream, meter.stream, createWriteStream(temporary, { mode: 0o600, flags: 'wx', flush: true }),
        { signal: writeOptions.signal }
      )
      await chmod(temporary, options.mode ?? 0o644)
      if (options.onConflict === 'overwrite') {
        await rename(temporary, path)
      } else {
        try {
          await link(temporary, path)
        } catch (error) {
          throw (error as NodeJS.ErrnoException).code === 'EEXIST' ? new PathError('exists') : error
        }
      }
    } catch (error) {
      streamUtils.discard(input.stream)
      throw error
    } finally {
      await rm(temporary, { force: true })
    }

    log.debug('File written', { bytes: meter.bytes() })

    return { kind: 'file', location: path, bytes: meter.bytes(), mime: input.verdict?.detected?.mime ?? input.info.mime }
  }

  return { kind: 'file', write }
}
