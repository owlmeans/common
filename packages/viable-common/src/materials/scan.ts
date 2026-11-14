import { MATERIAL_LINK_URL_MAX } from './consts.js'
import type { ReferenceScan } from './types.js'
import { REFERENCE_CUE_GAP_WORDS, REFERENCE_RESEARCH_CUES } from './scan/consts.js'
import { BRACKETS, GAP_TOKEN, LINK_PROTOCOLS, SEPARATOR, TRAILING_JUNK, URL_CANDIDATE, WORD } from './scan/consts.local.js'
import type { ReferenceScanHelper } from './scan/types.js'

/** Case and diacritics folded away: decomposed, combining marks dropped, lower-cased. */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const count = (text: string, char: string): number => text.split(char).length - 1

export const createReferenceScanHelper = (): ReferenceScanHelper => {
  /** One alternative of a cue token: a folded word, or a folded stem followed by any letters. */
  const alternativeOf = (raw: string): string => raw.endsWith('*')
    ? `${escapeRegExp(fold(raw.slice(0, -1)))}${WORD}*`
    : escapeRegExp(fold(raw))

  const cueOf = (cue: string): string => {
    const gap = `(?:${SEPARATOR}${WORD}+){0,${REFERENCE_CUE_GAP_WORDS}}`
    let body = ''
    let gapped = false
    for (const token of cue.split(/\s+/).filter(token => token !== '')) {
      if (token === GAP_TOKEN) {
        gapped = true
        continue
      }
      const word = `(?:${token.split('|').filter(one => one !== '').map(alternativeOf).join('|')})`
      body = body === '' ? word : `${body}${gapped ? gap : ''}${SEPARATOR}${word}`
      gapped = false
    }

    return body
  }

  // Built once: every language's cues in one expression, each standing on whole words.
  const cues = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${
    Object.values(REFERENCE_RESEARCH_CUES).flat().map(cueOf).filter(body => body !== '').join('|')
  })(?!${WORD})`, 'u')

  const normalize = (raw: string): string | null => {
    const text = raw.trim()
    if (text === '' || text.length > MATERIAL_LINK_URL_MAX) return null
    let url: URL
    try {
      url = new URL(text)
    } catch {
      return null
    }
    const protocol = url.protocol.toLowerCase()
    if (!LINK_PROTOCOLS.includes(protocol) || url.hostname === '') return null
    url.hash = ''
    url.username = ''
    url.password = ''
    if (url.search === '') url.search = ''
    // An S3 bucket is an opaque host to the URL parser, kept as written: lower-cased here.
    const href = protocol === 's3:'
      ? `s3://${url.host.toLowerCase()}${url.pathname}${url.search}`
      : url.href

    return href.length > MATERIAL_LINK_URL_MAX ? null : href
  }

  /** A candidate without what ended the sentence around it. */
  const trimmed = (candidate: string): string => {
    let text = candidate
    for (;;) {
      const last = text.at(-1) ?? ''
      const opening = BRACKETS[last]
      if (TRAILING_JUNK.has(last) || (opening != null && count(text, last) > count(text, opening))) {
        text = text.slice(0, -1)
        continue
      }

      return text
    }
  }

  const urls = (text: string): string[] => {
    const seen = new Set<string>()
    for (const match of text.matchAll(URL_CANDIDATE)) {
      const url = normalize(trimmed(match[0]))
      if (url != null) seen.add(url)
    }

    return [...seen]
  }

  const research = (text: string): boolean => cues.test(fold(text.replace(URL_CANDIDATE, ' ')))

  const scan = (text: string): ReferenceScan => ({ links: urls(text), research: research(text) })

  return { normalize, urls, research, scan }
}

export const referenceScanHelper = createReferenceScanHelper()
