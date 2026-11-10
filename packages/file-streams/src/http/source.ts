import { SourceError } from '../errors.js'
import type { FileInfo, FileSource, OpenedFile, OpenOptions, RangeReader, SignalOptions } from '../types.js'
import { nameUtils } from '../utils/names.js'
import { streamUtils } from '../utils/streams.js'
import type { HttpClient, HttpRequestOptions, HttpSourceOptions } from './types.js'
import type { KnownHttpFile } from './types.local.js'

/** A URL as a source: re-openable; Range-capable when the server answers ranges. */
export const makeHttpSource = (client: HttpClient, url: URL, options: HttpSourceOptions = {}): FileSource => {
  let known: Promise<KnownHttpFile> | undefined

  const base = (signal?: AbortSignal): HttpRequestOptions => ({ headers: options.headers, proxyKey: options.proxyKey, raw: options.raw, signal })

  const named = (info: FileInfo): FileInfo => ({ ...info, name: nameUtils.sanitize(options.name) ?? info.name })

  const discover = async (signal?: AbortSignal): Promise<KnownHttpFile> => {
    const response = await client.request(url, { ...base(signal), range: { start: 0, end: 0 } })
    streamUtils.discard(response.body)
    const etag = response.info.etag
    return {
      info: named(response.info),
      rangeable: response.status === 206 && response.info.size != null,
      final: response.url,
      validator: etag != null && !etag.startsWith('W/') ? etag : undefined,
    }
  }

  const learn = async (signal?: AbortSignal): Promise<KnownHttpFile> => {
    known ??= discover(signal)
    try {
      return await known
    } catch (error) {
      known = undefined
      throw error
    }
  }

  const info = async (infoOptions: SignalOptions = {}): Promise<FileInfo> => (await learn(infoOptions.signal)).info

  const open = async (openOptions: OpenOptions = {}): Promise<OpenedFile> => {
    const response = await client.request(url, { ...base(openOptions.signal), range: openOptions.range })
    if (openOptions.range != null && response.status !== 206) {
      streamUtils.discard(response.body)
      throw new SourceError('range-unsupported')
    }
    const opened: OpenedFile = { stream: response.body, info: named(response.info) }
    const span = /bytes (\d+)-(\d+)\/(\d+)/.exec(String(response.headers['content-range'] ?? ''))
    if (span != null) {
      opened.range = { start: Number(span[1]), end: Number(span[2]), total: Number(span[3]) }
    }

    return opened
  }

  const ranges = async (rangeOptions: SignalOptions = {}): Promise<RangeReader | null> => {
    const current = await learn(rangeOptions.signal)
    if (!current.rangeable || current.info.size == null) {
      return null
    }
    const size = current.info.size

    const fetchRange = async (start: number, end: number, signal?: AbortSignal) => {
      const response = await client.request(current.final, {
        ...base(signal), raw: true, range: { start, end }, ifRange: current.validator,
      })
      if (response.status !== 206) {
        streamUtils.discard(response.body)
        throw new SourceError('changed')
      }
      return response
    }

    return {
      size,
      read: async (offset, length, signal) => {
        const end = Math.min(offset + length, size) - 1
        if (end < offset) {
          return new Uint8Array(0)
        }
        const response = await fetchRange(offset, end, signal)
        return await streamUtils.collect(response.body, end - offset + 1)
      },
      stream: async (start, end, signal) => (await fetchRange(start, end - 1, signal)).body,
      close: async () => undefined,
    }
  }

  return { kind: 'http', info, open, ranges }
}
