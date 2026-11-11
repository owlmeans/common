import { EXTENSION_MIME } from '@owlmeans/file-inspector'
import type { FileSink, SinkInput, SinkResult, SinkWriteOptions } from '../types.js'
import { nameUtils } from '../utils/names.js'
import { streamUtils } from '../utils/streams.js'
import type { S3SinkOptions } from './types.js'
import type { S3Core, S3Uploader } from './types.local.js'

/** One object as a sink: its type from the verdict, never inline when it carries scripts. */
export const makeS3Sink = (core: S3Core, uploader: S3Uploader, prefix: string, options: S3SinkOptions = {}): FileSink => {
  const key = core.keyOf(prefix)

  const write = async (input: SinkInput, writeOptions: SinkWriteOptions = {}): Promise<SinkResult> => {
    const ext = nameUtils.extOf(prefix)
    const contentType = options.contentType ?? input.verdict?.detected?.mime ?? input.info.mime
      ?? (ext != null ? EXTENSION_MIME[ext] : undefined) ?? 'application/octet-stream'
    const active = input.verdict?.details.active === true && options.allowActiveInline !== true
    const disposition = active ? 'attachment' : options.disposition ?? 'inline'
    const meter = streamUtils.meter({ maxBytes: writeOptions.maxBytes })
    const stream = input.stream.pipe(meter.stream)
    input.stream.once('error', error => meter.stream.destroy(error))

    let result
    try {
      result = await uploader.upload({
        key, stream, contentType, disposition, cacheControl: options.cacheControl, metadata: options.metadata, signal: writeOptions.signal,
      })
    } catch (error) {
      streamUtils.discard(input.stream)
      throw error
    }

    return { kind: 's3', location: core.location(key), bytes: result.bytes, url: core.model.urlOf(prefix), etag: result.etag, mime: contentType }
  }

  return { kind: 's3', write }
}
