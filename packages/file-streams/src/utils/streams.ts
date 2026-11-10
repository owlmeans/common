import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { LimitError } from '../errors.js'
import type { StreamInput } from '../sources/types.js'
import { DEFAULT_PROGRESS_INTERVAL_MS } from './streams/consts.js'
import type { MeterOptions, PeekedStream, SpooledFile, SpoolOptions, StreamMeter, StreamUtils } from './streams/types.js'

export const createStreamUtils = (): StreamUtils => {
  const toReadable = (input: StreamInput | Uint8Array): Readable => {
    if (input instanceof Readable) {
      return input
    }
    if (input instanceof Uint8Array) {
      return Readable.from([Buffer.from(input.buffer, input.byteOffset, input.byteLength)], { objectMode: false })
    }
    if (typeof (input as ReadableStream<Uint8Array>).getReader === 'function') {
      return Readable.fromWeb(input as Parameters<typeof Readable.fromWeb>[0])
    }

    return Readable.from(input as AsyncIterable<Uint8Array>, { objectMode: false })
  }

  const meter = (options: MeterOptions): StreamMeter => {
    const started = Date.now()
    const hash = options.hash === 'sha256' ? createHash('sha256') : undefined
    const interval = options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS
    let bytes = 0
    let lastReport = 0
    let digest: string | undefined
    let idle: NodeJS.Timeout | undefined

    const report = (force: boolean): void => {
      if (options.onProgress == null) {
        return
      }
      const now = Date.now()
      if (force || now - lastReport >= interval) {
        lastReport = now
        options.onProgress({ bytes, total: options.total, elapsedMs: now - started })
      }
    }

    const stopIdle = (): void => {
      if (idle != null) {
        clearTimeout(idle)
        idle = undefined
      }
    }

    const transform = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        bytes += chunk.length
        if (options.maxBytes != null && bytes > options.maxBytes) {
          stopIdle()
          callback(new LimitError('max-bytes'))
          return
        }
        hash?.update(chunk)
        armIdle()
        report(false)
        callback(null, chunk)
      },
      flush: callback => {
        stopIdle()
        digest = hash?.digest('hex')
        report(true)
        callback()
      },
    })

    const armIdle = (): void => {
      if (options.idleTimeoutMs == null) {
        return
      }
      stopIdle()
      idle = setTimeout(() => transform.destroy(new LimitError('idle-timeout')), options.idleTimeoutMs)
      idle.unref?.()
    }

    transform.once('close', stopIdle)
    armIdle()

    return { stream: transform, bytes: () => bytes, sha256: () => digest }
  }

  const peek = async (stream: Readable, size: number): Promise<PeekedStream> => {
    const iterator = stream[Symbol.asyncIterator]() as AsyncIterator<Buffer>
    const chunks: Buffer[] = []
    let length = 0
    let ended = false

    try {
      while (length < size) {
        const next = await iterator.next()
        if (next.done === true) {
          ended = true
          break
        }
        const chunk = typeof next.value === 'string' ? Buffer.from(next.value) : next.value
        chunks.push(chunk)
        length += chunk.length
      }
    } catch (error) {
      await iterator.return?.()
      throw error
    }

    const head = Buffer.concat(chunks, length)

    let finished = ended
    const replay = async function * (): AsyncGenerator<Buffer> {
      try {
        if (head.length > 0) {
          yield head
        }
        while (!finished) {
          const next = await iterator.next()
          if (next.done === true) {
            finished = true
            break
          }
          yield next.value
        }
      } finally {
        if (!finished) {
          await iterator.return?.()
        }
      }
    }

    const replayed = Readable.from(replay(), { objectMode: false })
    // A replay destroyed before it was read never enters the generator: release the source here.
    replayed.once('close', () => {
      if (!finished) {
        finished = true
        stream.destroy()
      }
    })

    return { head, stream: replayed, ended }
  }

  const collect = async (stream: Readable, maxBytes: number): Promise<Buffer> => {
    const chunks: Buffer[] = []
    let length = 0
    for await (const chunk of stream) {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk as Buffer
      length += buffer.length
      if (length > maxBytes) {
        stream.destroy()
        throw new LimitError('max-bytes')
      }
      chunks.push(buffer)
    }

    return Buffer.concat(chunks, length)
  }

  const spool = async (stream: Readable, options: SpoolOptions = {}): Promise<SpooledFile> => {
    const dir = await mkdtemp(join(tmpdir(), 'owlmeans-file-streams-'))
    const path = join(dir, 'spool')
    const dispose = async (): Promise<void> => { await rm(dir, { recursive: true, force: true }) }
    const counter = meter({ maxBytes: options.maxBytes })

    try {
      await pipeline(stream, counter.stream, createWriteStream(path, { mode: 0o600, flags: 'wx' }), { signal: options.signal })
    } catch (error) {
      await dispose()
      throw error
    }

    return { path, size: counter.bytes(), dispose }
  }

  const discard = (stream: Readable): void => {
    stream.once('error', () => undefined)
    stream.destroy()
  }

  return { toReadable, meter, peek, collect, spool, discard }
}

export const streamUtils = createStreamUtils()
