import { basename } from 'node:path'
import { PassThrough, pipeline } from 'node:stream'
import type { Readable } from 'node:stream'
import { createGunzip, createGzip } from 'node:zlib'
import { logger } from '@owlmeans/log'
import { DEFAULT_SAMPLE_BYTES, fileInspector } from '@owlmeans/file-inspector'
import type { FileVerdict } from '@owlmeans/file-inspector'
import { ArchiveFormat, DEFAULT_ARCHIVE_LIMITS, NESTED_ARCHIVE_EXTENSIONS } from './archive/consts.js'
import { createFormatSniffer } from './archive/formats.js'
import { makeEntryGuard } from './archive/guard.js'
import { makeRatioGuard } from './archive/ratio.js'
import { createTarCodec } from './archive/tar.js'
import { createZipCodec } from './archive/zip.js'
import type {
  ArchiveEntryInfo, ArchiveExtractOptions, ArchiveHelper, ArchiveHelperOptions, ArchiveLimits, ArchiveListOptions,
  ArchivePackOptions, ExtractResult, PackEntry,
} from './archive/types.js'
import type { AcquiredArchive, ArchiveEntryHandle, EntryGuard } from './archive/types.local.js'
import { ArchiveError, LimitError, PathError } from './errors.js'
import { createFileSource } from './sources/file.js'
import { createStreamSource } from './sources/stream.js'
import type { FileInfo, FileSource, OpenedFile, OpenOptions, SignalOptions, TreeSink } from './types.js'
import { nameUtils } from './utils/names.js'
import { rangeUtils } from './utils/range.js'
import { streamUtils } from './utils/streams.js'
import { treeUtils } from './utils/tree.js'

const log = logger('file-streams:archive')

export const createArchiveHelper = (options: ArchiveHelperOptions = {}): ArchiveHelper => {
  const baseLimits: ArchiveLimits = { ...DEFAULT_ARCHIVE_LIMITS, ...options.limits }
  const inspector = options.inspector ?? fileInspector
  const sniffer = createFormatSniffer()
  const zip = createZipCodec()
  const tar = createTarCodec()
  const headBytes = 8 * 1024

  const limitsOf = (listOptions?: ArchiveListOptions): ArchiveLimits => ({ ...baseLimits, ...listOptions?.limits })

  const chain = (...streams: Array<NodeJS.ReadableStream | NodeJS.WritableStream>): Readable =>
    (pipeline as unknown as (...parts: unknown[]) => Readable)(...streams, () => undefined)

  const acquire = async (source: FileSource, format: ArchiveFormat | undefined, limits: ArchiveLimits, signal?: AbortSignal): Promise<AcquiredArchive> => {
    const reader = await source.ranges({ signal })
    if (reader != null) {
      const head = await reader.read(0, Math.min(headBytes, reader.size), signal)
      const detected = format ?? sniffer.formatOf(head)
      if (detected === ArchiveFormat.Zip) {
        return { format: detected, head, reader, dispose: async () => await reader.close() }
      }
      await reader.close()
      const opened = await source.open({ signal })
      return { format: detected, head, stream: opened.stream, dispose: async () => streamUtils.discard(opened.stream) }
    }

    const opened = await source.open({ signal })
    const peeked = await streamUtils.peek(opened.stream, headBytes)
    const detected = format ?? sniffer.formatOf(peeked.head)
    if (detected !== ArchiveFormat.Zip) {
      return { format: detected, head: peeked.head, stream: peeked.stream, dispose: async () => streamUtils.discard(peeked.stream) }
    }
    const spooled = await streamUtils.spool(peeked.stream, { maxBytes: limits.maxTotalBytes, signal })
    const fileReader = rangeUtils.ofFile(spooled.path, spooled.size)
    log.debug('Spooled a zip without random access', { bytes: spooled.size })

    return {
      format: detected,
      head: peeked.head,
      reader: fileReader,
      dispose: async () => {
        await fileReader.close()
        await spooled.dispose()
      },
    }
  }

  const gzipEntryName = (head: Uint8Array, info: FileInfo): string => {
    const fromHeader = nameUtils.sanitize(sniffer.gzipName(head))
    if (fromHeader != null) {
      return fromHeader
    }
    const name = info.name ?? 'data.gz'
    return name.toLowerCase().endsWith('.gz') && name.length > 3 ? name.slice(0, -3) : `${name}.out`
  }

  const handlesOf = async function * (acquired: AcquiredArchive, info: FileInfo, limits: ArchiveLimits): AsyncGenerator<ArchiveEntryHandle> {
    switch (acquired.format) {
      case ArchiveFormat.Zip:
        yield * zip.entries(acquired.reader!, limits)
        return
      case ArchiveFormat.Tar:
        yield * tar.entries(acquired.stream!)
        return
      case ArchiveFormat.TarGz: {
        const ratio = makeRatioGuard(limits)
        yield * tar.entries(chain(acquired.stream!, ratio.input, createGunzip(), ratio.output))
        return
      }
      case ArchiveFormat.Gzip: {
        const ratio = makeRatioGuard(limits)
        const stream = chain(acquired.stream!, ratio.input, createGunzip(), ratio.output)
        yield {
          info: { path: gzipEntryName(acquired.head, info), type: 'file' },
          open: async () => stream,
          drain: async () => streamUtils.discard(stream),
        }
        return
      }
      default:
        throw new ArchiveError('format')
    }
  }

  const detect = async (source: FileSource, detectOptions: SignalOptions = {}): Promise<ArchiveFormat | null> => {
    const acquired = await acquire(source, undefined, baseLimits, detectOptions.signal)
    await acquired.dispose()
    return acquired.format
  }

  const list = async (source: FileSource, listOptions: ArchiveListOptions = {}): Promise<ArchiveEntryInfo[]> => {
    const limits = limitsOf(listOptions)
    const acquired = await acquire(source, listOptions.format, limits, listOptions.signal)
    const entries: ArchiveEntryInfo[] = []
    try {
      for await (const handle of handlesOf(acquired, await source.info(), limits)) {
        entries.push(handle.info)
        if (entries.length > limits.maxEntries) {
          throw new LimitError('entries')
        }
        await handle.drain()
      }
    } finally {
      await acquired.dispose()
    }

    return entries
  }

  const isNested = (path: string): boolean => {
    const ext = nameUtils.extOf(path)
    return ext != null && NESTED_ARCHIVE_EXTENSIONS.includes(ext)
  }

  const nestedPrefix = (path: string): string => {
    const ext = nameUtils.extOf(path) ?? ''
    return path.slice(0, path.length - ext.length - 1) || path
  }

  const extractInto = async (
    source: FileSource, tree: TreeSink, extractOptions: ArchiveExtractOptions, depth: number, result: ExtractResult
  ): Promise<void> => {
    const signal = extractOptions.signal
    const limits = limitsOf(extractOptions)
    const guard: EntryGuard = makeEntryGuard(limits, extractOptions.links ?? 'skip', extractOptions.strip ?? 0)
    const info = await source.info({ signal })
    const acquired = await acquire(source, depth === 1 ? extractOptions.format : undefined, limits, signal)
    if (acquired.format == null) {
      await acquired.dispose()
      throw new ArchiveError('format')
    }
    if (depth === 1) {
      result.format = acquired.format
    }

    try {
      for await (const handle of handlesOf(acquired, info, limits)) {
        signal?.throwIfAborted()
        const admission = guard.admit(handle.info)
        if (admission.path == null) {
          result.skipped.push({ entry: handle.info, reason: admission.skip ?? 'skipped' })
          await handle.drain()
          continue
        }
        if (extractOptions.filter != null && !extractOptions.filter(handle.info)) {
          result.skipped.push({ entry: handle.info, reason: 'filtered' })
          await handle.drain()
          continue
        }
        if (handle.info.type === 'directory') {
          await tree.directory(admission.path, { signal })
          continue
        }

        const path = admission.path
        try {
          let stream = chain(await handle.open(), guard.meter())
          let verdict: FileVerdict | undefined
          if (extractOptions.verify != null) {
            const peeked = await streamUtils.peek(stream, extractOptions.verify.sampleBytes ?? DEFAULT_SAMPLE_BYTES)
            stream = peeked.stream
            verdict = inspector.enforce(await inspector.inspect(peeked.head, { name: path }, { complete: peeked.ended }), extractOptions.verify)
          }
          if (depth < limits.maxDepth && isNested(path)) {
            const spooled = await streamUtils.spool(stream, { maxBytes: limits.maxEntryBytes, signal })
            try {
              await extractInto(
                createFileSource(spooled.path, { name: basename(path) }), treeUtils.prefixed(tree, nestedPrefix(path)),
                { ...extractOptions, format: undefined }, depth + 1, result
              )
            } finally {
              await spooled.dispose()
            }
            continue
          }
          const written = await tree.entry(path).write({
            stream,
            info: { origin: `${info.origin}#${path}`, name: nameUtils.sanitize(basename(path)), size: handle.info.size },
            verdict,
          }, { signal })
          result.extracted.push({ entry: handle.info, path, result: written })
          result.bytes += written.bytes
          extractOptions.onEntry?.(handle.info, written)
        } catch (error) {
          await handle.drain().catch(() => undefined)
          const fatal = error instanceof LimitError || error instanceof ArchiveError || error instanceof PathError || signal?.aborted === true
          if (extractOptions.onEntryError === 'skip' && !fatal) {
            result.skipped.push({ entry: handle.info, reason: (error as Error).message })
            continue
          }
          throw error
        }
      }
    } finally {
      await acquired.dispose()
    }
  }

  const extract = async (source: FileSource, tree: TreeSink, extractOptions: ArchiveExtractOptions = {}): Promise<ExtractResult> => {
    const result: ExtractResult = { format: extractOptions.format ?? ArchiveFormat.Zip, extracted: [], skipped: [], bytes: 0 }
    await extractInto(source, tree, extractOptions, 1, result)
    log.debug('Extracted', { format: result.format, entries: result.extracted.length, skipped: result.skipped.length, bytes: result.bytes })

    return result
  }

  const pack = (format: ArchiveFormat, entries: Iterable<PackEntry> | AsyncIterable<PackEntry>, packOptions: ArchivePackOptions = {}): FileSource => {
    const level = packOptions.level != null ? { level: packOptions.level } : {}
    const name = packOptions.name
    switch (format) {
      case ArchiveFormat.Zip:
        return createStreamSource(zip.pack(entries, packOptions), { name, mime: 'application/zip' })
      case ArchiveFormat.Tar:
        return createStreamSource(tar.pack(entries, packOptions), { name, mime: 'application/x-tar' })
      case ArchiveFormat.TarGz:
        return createStreamSource(chain(tar.pack(entries, packOptions), createGzip(level)), { name, mime: 'application/gzip' })
      case ArchiveFormat.Gzip: {
        const output = new PassThrough()
        const run = async (): Promise<void> => {
          const all: PackEntry[] = []
          for await (const entry of entries) {
            all.push(entry)
          }
          if (all.length !== 1) {
            throw new ArchiveError('gzip-entries')
          }
          const source = all[0].source
          const input = source instanceof Uint8Array ? streamUtils.toReadable(source) : (await source.open()).stream
          chain(input, createGzip(level), output)
        }
        run().catch(error => output.destroy(error as Error))
        return createStreamSource(output, { name, mime: 'application/gzip' })
      }
      default:
        throw new ArchiveError('format')
    }
  }

  const gzip = (source: FileSource, packOptions: ArchivePackOptions = {}): FileSource => {
    const info = async (infoOptions?: SignalOptions): Promise<FileInfo> => {
      const base = await source.info(infoOptions)
      return { origin: base.origin, name: packOptions.name ?? (base.name != null ? `${base.name}.gz` : undefined), mime: 'application/gzip' }
    }
    const open = async (openOptions: OpenOptions = {}): Promise<OpenedFile> => {
      const opened = await source.open({ signal: openOptions.signal })
      return { stream: chain(opened.stream, createGzip(packOptions.level != null ? { level: packOptions.level } : {})), info: await info() }
    }
    return { kind: 'gzip', info, open, ranges: async () => null }
  }

  const gunzip = (source: FileSource, listOptions: ArchiveListOptions = {}): FileSource => {
    const limits = limitsOf(listOptions)
    const info = async (infoOptions?: SignalOptions): Promise<FileInfo> => {
      const base = await source.info(infoOptions)
      const name = base.name?.toLowerCase().endsWith('.gz') === true ? base.name.slice(0, -3) : base.name
      return { origin: base.origin, name }
    }
    const open = async (openOptions: OpenOptions = {}): Promise<OpenedFile> => {
      const opened = await source.open({ signal: openOptions.signal })
      const ratio = makeRatioGuard(limits)
      return { stream: chain(opened.stream, ratio.input, createGunzip(), ratio.output), info: await info() }
    }
    return { kind: 'gzip', info, open, ranges: async () => null }
  }

  return { detect, list, extract, pack, gzip, gunzip }
}

export const archiveHelper = createArchiveHelper()
