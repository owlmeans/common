import { BOT_KEYWORD_MAX, BOT_KEYWORDS_MAX, BotMatchMode } from '../consts.js'
import { BOT_SPACE_PATTERN, BOT_TOKEN_PATTERN } from '../consts.local.js'
import type { BotMatch, BotRule } from '../types.js'
import type { BotRuleHelper } from './rule/types.js'

export const createBotRuleHelper = (): BotRuleHelper => {
  /**
   * NFKC, then a case fold: upper-casing first maps what lower-casing alone keeps apart (`ß` → `SS`
   * → `ss`, final `ς` → `Σ` → `σ`), and NFKC again recomposes what the case mapping decomposed.
   */
  const fold = (text: string): string =>
    text.normalize('NFKC').toUpperCase().toLowerCase().normalize('NFKC')

  const tokensOf = (text: string): string[] => fold(text).match(BOT_TOKEN_PATTERN) ?? []

  const spacedOf = (text: string): string => fold(text).replace(BOT_SPACE_PATTERN, ' ').trim()

  const hasPhrase = (tokens: readonly string[], phrase: readonly string[]): boolean => {
    for (let at = 0; at + phrase.length <= tokens.length; at++) {
      if (phrase.every((token, offset) => tokens[at + offset] === token)) {
        return true
      }
    }
    return false
  }

  const match = (text: string, rules: readonly BotRule[]): BotMatch[] => {
    if (typeof text !== 'string' || text.trim() === '') {
      return []
    }
    // Folded once per message, never per rule.
    let tokens: string[] | undefined
    let spaced: string | undefined

    const matchesKeyword = (mode: BotMatchMode, keyword: string): boolean => {
      if (mode === BotMatchMode.Contains) {
        const needle = spacedOf(keyword)
        spaced ??= spacedOf(text)
        return needle !== '' && spaced.includes(needle)
      }
      const phrase = tokensOf(keyword)
      tokens ??= tokensOf(text)
      return phrase.length > 0 && hasPhrase(tokens, phrase)
    }

    return rules
      .filter(rule => rule.enabled)
      .map((rule): BotMatch => ({
        rule,
        keywords: [...new Set(rule.keywords.filter(
          keyword => typeof keyword === 'string' && matchesKeyword(rule.mode ?? BotMatchMode.Word, keyword)
        ))],
      }))
      .filter(found => found.keywords.length > 0)
      // Array#sort is stable: rules of equal order keep the order they were given in.
      .sort((left, right) => (left.rule.order ?? 0) - (right.rule.order ?? 0))
  }

  const normalizeKeywords = (list: readonly string[]): string[] => {
    const seen = new Set<string>()
    const result: string[] = []

    for (const raw of list ?? []) {
      if (typeof raw !== 'string') {
        continue
      }
      const keyword = Array.from(raw.replace(BOT_SPACE_PATTERN, ' ').trim())
        .slice(0, BOT_KEYWORD_MAX).join('').trim()
      const key = spacedOf(keyword)
      if (keyword === '' || seen.has(key)) {
        continue
      }
      seen.add(key)
      result.push(keyword)
      if (result.length >= BOT_KEYWORDS_MAX) {
        break
      }
    }

    return result
  }

  const appliesTo = (rule: Pick<BotRule, 'connection'>, connection: string): boolean =>
    rule.connection == null || rule.connection === connection

  return { match, normalizeKeywords, appliesTo }
}

export const botRuleHelper = createBotRuleHelper()
