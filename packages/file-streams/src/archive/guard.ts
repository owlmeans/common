import { Transform } from 'node:stream'
import { ArchiveError, LimitError, PathError } from '../errors.js'
import { pathUtils } from '../utils/paths.js'
import type { ArchiveEntryInfo, ArchiveLimits } from './types.js'
import type { EntryAdmission, EntryGuard } from './types.local.js'

/** The rules every entry of one extraction passes: counts, names, links, duplicates, sizes. */
export const makeEntryGuard = (limits: ArchiveLimits, links: 'skip' | 'refuse', strip: number): EntryGuard => {
  const seen = new Set<string>()
  let entries = 0
  let total = 0

  const admit = (info: ArchiveEntryInfo): EntryAdmission => {
    if (++entries > limits.maxEntries) {
      throw new LimitError('entries')
    }
    if (info.type === 'symlink' || info.type === 'hardlink') {
      if (links === 'refuse') {
        throw new ArchiveError('link')
      }
      return { skip: 'link' }
    }
    if (info.type === 'other') {
      return { skip: 'unsupported-type' }
    }
    if (info.encrypted === true) {
      throw new ArchiveError('encrypted')
    }
    const segments = info.path.replace(/\\/g, '/').split('/').filter(segment => segment !== '')
    if (segments.length <= strip) {
      return { skip: 'stripped' }
    }
    const path = pathUtils.entry(segments.slice(strip).join('/'), limits)
    if (info.type === 'file') {
      if (info.size != null && info.size > limits.maxEntryBytes) {
        throw new LimitError('entry-bytes')
      }
      const folded = path.toLowerCase()
      if (seen.has(folded)) {
        throw new PathError('duplicate')
      }
      seen.add(folded)
    }

    return { path }
  }

  const meter = (): Transform => {
    let bytes = 0
    return new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        bytes += chunk.length
        total += chunk.length
        if (bytes > limits.maxEntryBytes) {
          callback(new LimitError('entry-bytes'))
          return
        }
        if (total > limits.maxTotalBytes) {
          callback(new LimitError('total-bytes'))
          return
        }
        callback(null, chunk)
      },
    })
  }

  return { limits, admit, meter }
}
