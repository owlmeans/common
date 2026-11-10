import { createReadStream } from 'node:fs'
import { once } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import tarStream from 'tar-stream'
import type { Header } from 'tar-stream'
import { ArchiveError } from '../errors.js'
import { pathUtils } from '../utils/paths.js'
import { streamUtils } from '../utils/streams.js'
import { DEFAULT_ARCHIVE_LIMITS } from './consts.js'
import type { ArchiveEntryInfo, ArchiveEntryType, ArchivePackOptions, PackEntry } from './types.js'
import type { ArchiveEntryHandle, TarCodec, TarEntryWriter } from './types.local.js'

/** Tar read and written as streams (tar-stream); an entry is never destroyed, only drained. */
export const createTarCodec = (): TarCodec => {
  const typeOf = (type: Header['type'] | undefined): ArchiveEntryType => {
    switch (type) {
      case 'file':
      case 'contiguous-file':
      case undefined:
        return 'file'
      case 'directory':
        return 'directory'
      case 'symlink':
        return 'symlink'
      case 'link':
        return 'hardlink'
      default:
        return 'other'
    }
  }

  const infoOf = (header: Header): ArchiveEntryInfo => ({
    path: header.name,
    type: typeOf(header.type),
    size: header.size,
    mode: header.mode != null ? header.mode & 0o7777 : undefined,
    modifiedAt: header.mtime,
    linkTarget: header.linkname !== '' ? header.linkname : undefined,
  })

  const entries = async function * (stream: Readable): AsyncGenerator<ArchiveEntryHandle> {
    const extract = tarStream.extract()
    stream.once('error', error => extract.destroy(error))
    stream.pipe(extract)
    try {
      for await (const entry of extract) {
        let ended = false
        let opened = false
        const finished = new Promise<void>(resolve => {
          entry.once('end', () => { ended = true; resolve() })
          entry.once('close', () => resolve())
        })
        const drain = async (): Promise<void> => {
          if (!ended) {
            if (!opened) {
              entry.resume()
            }
            await finished
          }
        }
        yield {
          info: infoOf(entry.header),
          open: async () => {
            opened = true
            const relay = new PassThrough()
            let detached = false
            relay.once('close', () => { detached = true })
            const pump = async (): Promise<void> => {
              // The entry is read to its end even when the consumer gave up: destroying a tar
              // entry would destroy the whole archive stream.
              for await (const chunk of entry) {
                if (!detached && !relay.write(chunk)) {
                  await Promise.race([once(relay, 'drain'), once(relay, 'close')])
                }
              }
              if (!detached) {
                relay.end()
              }
            }
            pump().catch(error => { if (!detached) relay.destroy(error as Error) })
            return relay
          },
          drain,
        }
        await drain()
      }
    } catch (error) {
      throw error instanceof Error && /unexpected end|invalid tar|header/i.test(error.message) ? new ArchiveError('corrupt') : error
    } finally {
      if (!extract.destroyed) {
        extract.destroy()
      }
    }
  }

  const write = async (writer: TarEntryWriter, stream: Readable): Promise<void> => {
    for await (const chunk of stream) {
      if (!writer.write(chunk as Buffer)) {
        await new Promise(resolve => writer.once('drain', resolve))
      }
    }
    const done = new Promise((resolve, reject) => {
      writer.once('finish', resolve)
      writer.once('error', reject)
    })
    writer.end()
    await done
  }

  const pack = (list: Iterable<PackEntry> | AsyncIterable<PackEntry>, options: ArchivePackOptions): Readable => {
    const packer = tarStream.pack()
    const output = Readable.from(packer as unknown as AsyncIterable<Buffer>, { objectMode: false })
    const add = async (): Promise<void> => {
      for await (const entry of list) {
        const header = { name: pathUtils.entry(entry.path), mode: (entry.mode ?? 0o644) & 0o777, mtime: entry.modifiedAt ?? new Date() }
        const source = entry.source
        if (source instanceof Uint8Array) {
          await new Promise<void>((resolve, reject) => {
            packer.entry({ ...header, size: source.length }, Buffer.from(source), error => error != null ? reject(error) : resolve())
          })
          continue
        }
        let size = (await source.info()).size
        if (size != null) {
          await write(packer.entry({ ...header, size }), (await source.open()).stream)
          continue
        }
        const spooled = await streamUtils.spool((await source.open()).stream, { maxBytes: options.maxSpoolBytes ?? DEFAULT_ARCHIVE_LIMITS.maxEntryBytes })
        try {
          size = spooled.size
          await write(packer.entry({ ...header, size }), createReadStream(spooled.path))
        } finally {
          await spooled.dispose()
        }
      }
      packer.finalize()
    }
    add().catch(error => {
      packer.destroy(error as Error)
      output.destroy(error as Error)
    })

    return output
  }

  return { entries, pack }
}
