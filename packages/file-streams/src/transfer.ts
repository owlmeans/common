import { pipeline } from 'node:stream'
import type { Readable } from 'node:stream'
import { logger } from '@owlmeans/log'
import { DEFAULT_SAMPLE_BYTES, fileInspector } from '@owlmeans/file-inspector'
import type { FileVerdict } from '@owlmeans/file-inspector'
import { LimitError } from './errors.js'
import { DEFAULT_TRANSFER_LIMITS, FALLBACK_FILE_NAME } from './transfer/consts.js'
import type { TransferHelper, TransferHelperOptions, TransferOptions, TransferResult } from './transfer/types.js'
import type { FileInfo, FileSink, FileSource, TreeSink } from './types.js'
import { nameUtils } from './utils/names.js'
import { signalUtils } from './utils/signals.js'
import { streamUtils } from './utils/streams.js'

const log = logger('file-streams:transfer')

export const createTransferHelper = (options: TransferHelperOptions = {}): TransferHelper => {
  const inspector = options.inspector ?? fileInspector

  const run = async (source: FileSource, sinkOf: (info: FileInfo) => FileSink, transferOptions: TransferOptions = {}): Promise<TransferResult> => {
    const limits = { ...DEFAULT_TRANSFER_LIMITS, ...options.limits, ...transferOptions.limits }
    const composed = signalUtils.compose([transferOptions.signal], limits.timeoutMs)
    const signal = composed.signal
    const started = Date.now()
    let stream: Readable | undefined

    try {
      const opened = await source.open({ signal })
      const info: FileInfo = { ...opened.info, ...transferOptions.info }
      if (transferOptions.info?.name != null) {
        info.name = nameUtils.sanitize(transferOptions.info.name)
      }
      if (info.size != null && info.size > limits.maxBytes) {
        streamUtils.discard(opened.stream)
        throw new LimitError('max-bytes')
      }

      const meter = streamUtils.meter({
        maxBytes: limits.maxBytes,
        idleTimeoutMs: limits.idleTimeoutMs,
        total: info.size,
        onProgress: transferOptions.onProgress,
        progressIntervalMs: transferOptions.progressIntervalMs,
        hash: transferOptions.hash,
      })
      stream = (pipeline as unknown as (...parts: unknown[]) => Readable)(opened.stream, meter.stream, () => undefined)
      const current = stream
      const release = signalUtils.onAbort(signal, reason => current.destroy(reason as Error))

      try {
        let verdict: FileVerdict | undefined
        if (transferOptions.verify !== false) {
          const policy = transferOptions.verify ?? {}
          const peeked = await streamUtils.peek(stream, policy.sampleBytes ?? DEFAULT_SAMPLE_BYTES)
          stream = peeked.stream
          verdict = inspector.enforce(
            await inspector.inspect(peeked.head, { name: info.name, mime: info.mime }, { complete: peeked.ended }), policy
          )
        }
        const sink = await sinkOf(info).write({ stream, info, verdict }, { signal, maxBytes: limits.maxBytes })
        const result: TransferResult = { bytes: meter.bytes(), durationMs: Date.now() - started, info, verdict, sink }
        const digest = meter.sha256()
        if (digest != null) {
          result.sha256 = digest
        }
        log.debug('Transferred', { origin: info.origin, bytes: result.bytes, sink: sink.kind })
        return result
      } finally {
        release()
      }
    } catch (error) {
      if (stream != null) {
        streamUtils.discard(stream)
      }
      throw signal.aborted && signal.reason != null ? signal.reason : error
    } finally {
      composed.dispose()
    }
  }

  const copy = async (source: FileSource, sink: FileSink, transferOptions?: TransferOptions): Promise<TransferResult> =>
    await run(source, () => sink, transferOptions)

  const copyInto = async (source: FileSource, tree: TreeSink, transferOptions?: TransferOptions): Promise<TransferResult> =>
    await run(source, info => tree.entry(info.name ?? FALLBACK_FILE_NAME), transferOptions)

  return { copy, copyInto }
}

export const transferHelper = createTransferHelper()
