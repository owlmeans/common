import { BotTextMatch } from '../consts.js'
import { BOT_PHRASE_SEPARATOR_PATTERN, BOT_SPACE_PATTERN, BOT_TOKEN_PATTERN } from '../consts.local.js'
import type { BotTextHelper } from './text/types.js'

export const createBotTextHelper = (): BotTextHelper => {
  /**
   * NFKC, then a case fold: upper-casing first maps what lower-casing alone keeps apart (`ß` → `SS`
   * → `ss`, final `ς` → `Σ` → `σ`), and NFKC again recomposes what the case mapping decomposed.
   */
  const fold = (text: string): string =>
    typeof text === 'string' ? text.normalize('NFKC').toUpperCase().toLowerCase().normalize('NFKC') : ''

  const tokensOf = (text: string): string[] => fold(text).match(BOT_TOKEN_PATTERN) ?? []

  /** The folded text with whitespace runs collapsed — the `contains` form and the dedupe key. */
  const spacedOf = (text: string): string => fold(text).replace(BOT_SPACE_PATTERN, ' ').trim()

  const hasPhrase = (tokens: readonly string[], phrase: readonly string[]): boolean => {
    for (let at = 0; at + phrase.length <= tokens.length; at++) {
      if (phrase.every((token, offset) => tokens[at + offset] === token)) {
        return true
      }
    }
    return false
  }

  const matched = (text: string, phrases: readonly string[], mode: BotTextMatch = BotTextMatch.Word): string[] => {
    if (typeof text !== 'string' || text.trim() === '' || !Array.isArray(phrases)) {
      return []
    }
    // Folded once per text, never per phrase.
    let tokens: string[] | undefined
    let spaced: string | undefined

    const found = (phrase: string): boolean => {
      if (mode === BotTextMatch.Contains) {
        const needle = spacedOf(phrase)
        spaced ??= spacedOf(text)
        return needle !== '' && spaced.includes(needle)
      }
      const words = tokensOf(phrase)
      tokens ??= tokensOf(text)
      return words.length > 0 && hasPhrase(tokens, words)
    }

    const seen = new Set<string>()
    const result: string[] = []
    for (const phrase of phrases) {
      if (typeof phrase !== 'string') {
        continue
      }
      const key = spacedOf(phrase)
      if (key === '' || seen.has(key)) {
        continue
      }
      seen.add(key)
      if (found(phrase)) {
        result.push(phrase)
      }
    }

    return result
  }

  const phrasesOf = (input: string | readonly string[]): string[] => {
    const items: readonly unknown[] = typeof input === 'string' ? [input] : Array.isArray(input) ? input : []
    const seen = new Set<string>()
    const result: string[] = []

    for (const item of items) {
      if (typeof item !== 'string') {
        continue
      }
      for (const part of item.split(BOT_PHRASE_SEPARATOR_PATTERN)) {
        const phrase = part.replace(BOT_SPACE_PATTERN, ' ').trim()
        const key = spacedOf(phrase)
        if (key === '' || seen.has(key)) {
          continue
        }
        seen.add(key)
        result.push(phrase)
      }
    }

    return result
  }

  return { fold, tokensOf, matched, phrasesOf }
}

export const botTextHelper = createBotTextHelper()
