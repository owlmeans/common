import { gunzipSync } from 'node:zlib'
import { constants } from 'node:zlib'
import { ArchiveFormat } from './consts.js'
import type { FormatSniffer } from './types.local.js'

/** Archive formats told from leading bytes. */
export const createFormatSniffer = (): FormatSniffer => {
  const isTarHeader = (block: Uint8Array): boolean => {
    if (block.length < 512) {
      return false
    }
    if (Buffer.from(block.subarray(257, 262)).toString('latin1') === 'ustar') {
      return true
    }
    const stored = parseInt(Buffer.from(block.subarray(148, 156)).toString('latin1').replace(/\0.*$/, '').trim(), 8)
    if (Number.isNaN(stored)) {
      return false
    }
    let sum = 0
    for (let index = 0; index < 512; index++) {
      sum += index >= 148 && index < 156 ? 0x20 : block[index]
    }

    return sum === stored
  }

  const inflateHead = (head: Uint8Array): Uint8Array => {
    try {
      return gunzipSync(head, { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: 64 * 1024 })
    } catch {
      return new Uint8Array(0)
    }
  }

  const formatOf = (head: Uint8Array): ArchiveFormat | null => {
    if (head[0] === 0x50 && head[1] === 0x4b && [0x0304, 0x0506, 0x0708].includes((head[2] << 8) | head[3])) {
      return ArchiveFormat.Zip
    }
    if (head[0] === 0x1f && head[1] === 0x8b) {
      return isTarHeader(inflateHead(head)) ? ArchiveFormat.TarGz : ArchiveFormat.Gzip
    }

    return isTarHeader(head) ? ArchiveFormat.Tar : null
  }

  const gzipName = (head: Uint8Array): string | undefined => {
    if (head[0] !== 0x1f || head[1] !== 0x8b || (head[3] & 0x08) === 0) {
      return undefined
    }
    let offset = 10
    if ((head[3] & 0x04) !== 0) {
      offset += 2 + (head[10] | (head[11] << 8))
    }
    const end = head.indexOf(0, offset)

    return end > offset ? Buffer.from(head.subarray(offset, end)).toString('latin1') : undefined
  }

  return { formatOf, gzipName }
}
