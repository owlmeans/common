import { createHash } from 'node:crypto'
import { CAP_MARKER, SEGMENT_CHARS, SEGMENT_UNSAFE, SENTENCE_END, SENTENCE_REACH, SENTENCE_START } from './text/consts.js'
import type { TextUtils } from './text/types.js'

export const createTextUtils = (): TextUtils => {
  const cap: TextUtils['cap'] = (text, max) => {
    if (text.length <= max) return text
    const head = text.slice(0, max)
    const cut = Math.max(head.lastIndexOf('\n'), head.lastIndexOf(' '))
    const kept = cut > max * 0.6 ? head.slice(0, cut) : head

    return kept.trimEnd() + CAP_MARKER.replace('{n}', String(text.length - kept.length))
  }

  const line: TextUtils['line'] = (text, max) => {
    const flat = text.replace(/\s+/g, ' ').trim()
    if (flat.length <= max) return flat
    const head = flat.slice(0, max - 1)
    const cut = head.lastIndexOf(' ')

    return (cut > max * 0.6 ? head.slice(0, cut) : head).trimEnd() + '…'
  }

  const sentenceAt: TextUtils['sentenceAt'] = (text, at, length) => {
    const floor = Math.max(0, at - SENTENCE_REACH)
    const before = text.slice(floor, at)
    const ends = [...before.matchAll(SENTENCE_START)]
    const last = ends[ends.length - 1]
    const start = last != null ? floor + last.index! + last[0].length : floor
    const after = text.slice(at + length, at + length + SENTENCE_REACH)
    const stop = after.search(SENTENCE_END)
    const end = stop < 0 ? at + length + after.length : at + length + stop + (after[stop] === '\n' ? 0 : 1)

    return line(text.slice(start, end).replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''), 2 * SENTENCE_REACH)
  }

  const words: TextUtils['words'] = text => text.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length

  const squash: TextUtils['squash'] = text => text.replace(/\s+/g, ' ').trim().toLowerCase()

  const digest: TextUtils['digest'] = text => createHash('sha256').update(text).digest('hex').slice(0, 10)

  const segment: TextUtils['segment'] = text => {
    const safe = text.replace(SEGMENT_UNSAFE, '-').replace(/^[-.]+|[-.]+$/g, '')
    if (safe === text && safe.length <= SEGMENT_CHARS && safe !== '') return safe
    // A changed or cut name could collide with another one; the digest of the original keeps them apart.
    return `${safe.slice(0, SEGMENT_CHARS - 11) || 'x'}-${digest(text)}`
  }

  return { cap, line, sentenceAt, words, squash, segment, digest }
}

export const textUtils = createTextUtils()
