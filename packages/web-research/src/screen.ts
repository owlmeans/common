import { ScreenTextKind } from './consts.js'
import {
  ADDRESSED_TO_AI, BIDI_CHARS, HIDDEN_COMMENTS, HIDDEN_ELEMENT, HIDDEN_PROSE_WORDS, HTML_INERT_BLOCKS, INVISIBLE_CHARS,
  INVISIBLE_NOISE, InjectionSignalKind, OVERRIDES, SIGNAL_EXCERPT_CHARS, STRONG_SIGNAL_KINDS, TAG_CHAR, TAG_CHARS,
} from './screen/consts.js'
import type { InjectionSignal, InjectionSignalsHelper } from './screen/types.js'
import { textUtils } from './utils/text.js'

/**
 * The hidden-instruction signal pass. Without `kind` it reads the text exactly as viable-materials'
 * screen pre-pass does (`signals(extracted.raw, { hidden: extracted.hidden })` gives the same list).
 */
export const createInjectionSignalsHelper = (): InjectionSignalsHelper => {
  const excerpt = (text: string): string => textUtils.line(text, SIGNAL_EXCERPT_CHARS)

  const readable: InjectionSignalsHelper['readable'] = (text, kind) =>
    kind === ScreenTextKind.Html ? HTML_INERT_BLOCKS.reduce((raw, pattern) => raw.replace(pattern, ' '), text) : text

  const signals: InjectionSignalsHelper['signals'] = (text, options = {}) => {
    const found: InjectionSignal[] = []
    const raw = readable(text, options.kind)

    const tags = raw.match(TAG_CHARS) ?? []
    const invisible = raw.replace(/^\uFEFF/, '').match(INVISIBLE_CHARS) ?? []
    if (tags.length > 0 || invisible.length > INVISIBLE_NOISE) {
      const decoded = [...raw].filter(char => TAG_CHAR.test(char))
        .map(char => String.fromCodePoint(char.codePointAt(0)! - 0xE0000)).join('')
      found.push({
        kind: InjectionSignalKind.Invisible,
        excerpt: excerpt(`${tags.length + invisible.length} invisible characters${decoded.trim() !== '' ? `; tag text: ${decoded}` : ''}`),
      })
    }
    const bidi = raw.match(BIDI_CHARS) ?? []
    if (bidi.length > 0) found.push({ kind: InjectionSignalKind.Bidi, excerpt: `${bidi.length} bidirectional control characters` })

    for (const pattern of HIDDEN_COMMENTS) {
      for (const match of raw.matchAll(pattern)) {
        const body = (match[1] ?? '').trim()
        if (textUtils.words(body) >= HIDDEN_PROSE_WORDS) found.push({ kind: InjectionSignalKind.HiddenComment, excerpt: excerpt(body) })
      }
    }
    for (const match of raw.matchAll(HIDDEN_ELEMENT)) {
      const body = (match[2] ?? '').replace(/<[^>]+>/g, ' ').trim()
      if (textUtils.words(body) >= HIDDEN_PROSE_WORDS) found.push({ kind: InjectionSignalKind.HiddenElement, excerpt: excerpt(body) })
    }
    for (const hidden of options.hidden ?? []) {
      if (textUtils.words(hidden) >= HIDDEN_PROSE_WORDS) found.push({ kind: InjectionSignalKind.HiddenRun, excerpt: excerpt(hidden) })
    }
    for (const pattern of ADDRESSED_TO_AI) {
      for (const match of raw.matchAll(pattern)) {
        found.push({ kind: InjectionSignalKind.AddressedToAi, excerpt: textUtils.sentenceAt(raw, match.index, match[0].length) })
      }
    }
    for (const pattern of OVERRIDES) {
      for (const match of raw.matchAll(pattern)) {
        found.push({ kind: InjectionSignalKind.Override, excerpt: textUtils.sentenceAt(raw, match.index, match[0].length) })
      }
    }

    const seen = new Set<string>()

    return found.filter(signal => {
      const key = `${signal.kind}:${signal.excerpt}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const strong: InjectionSignalsHelper['strong'] = (found, kinds = STRONG_SIGNAL_KINDS) =>
    found.some(signal => kinds.includes(signal.kind))

  return { signals, readable, strong }
}

export const injectionSignalsHelper = createInjectionSignalsHelper()
