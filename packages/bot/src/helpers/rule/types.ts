import type { BotMatch, BotRule } from '../../types.js'

/**
 * How a message is matched against keyword groups — the ONE implementation the server's dispatch,
 * the panels and the tests share, so a rule means the same thing everywhere.
 */
export interface BotRuleHelper {
  /**
   * The enabled rules whose keywords the text matches, ordered by `order` (ties keep the given
   * order), each with the keywords (as stored) that matched.
   *
   * Both sides are folded the same way: NFKC, then case-folded (`ß` ≡ `ss`, `Ё` ≡ `ё`), accents
   * kept. `word` compares whole tokens — runs of letters, combining marks, digits and `_` — and a
   * multi-word keyword is a PHRASE that must appear as consecutive tokens; `contains` is a substring
   * of the folded text with whitespace runs collapsed. Disabled rules never match.
   */
  match: (text: string, rules: readonly BotRule[]) => BotMatch[]
  /**
   * A keyword list as it is stored: each trimmed with inner whitespace collapsed, cut to
   * `BOT_KEYWORD_MAX` code points, empties dropped, duplicates (by their folded form) dropped keeping
   * the first spelling, at most `BOT_KEYWORDS_MAX` kept.
   */
  normalizeKeywords: (list: readonly string[]) => string[]
  /** Whether a rule applies to a connection: its own, or a scope-wide one (`connection` null/absent). */
  appliesTo: (rule: Pick<BotRule, 'connection'>, connection: string) => boolean
}
