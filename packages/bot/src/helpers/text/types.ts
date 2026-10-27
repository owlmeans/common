import type { BotTextMatch } from '../../consts.js'

/**
 * Unicode-aware comparison of a message with phrases — the pure primitive a bot handler matches
 * message text with (the application's own keyword groups, a command's argument, a reply's text).
 *
 * Both sides fold the same way: NFKC, then a case fold, then NFKC again (`ß` ≡ `ss`, `Ё` ≡ `ё`,
 * full-width ≡ ASCII, ligatures ≡ their letters); accents are kept (`cafe` is not `café`).
 */
export interface BotTextHelper {
  /** The folded form of a text: NFKC, upper- then lower-cased, NFKC again. */
  fold: (text: string) => string
  /**
   * The folded tokens of a text: runs of letters, combining marks, digits and `_`; everything else
   * (punctuation, spaces, symbols) splits. `[]` for a text with none.
   */
  tokensOf: (text: string) => string[]
  /**
   * The phrases found in `text`, in the order they were given, each once — a phrase whose folded
   * form repeats an earlier one is skipped, so the first spelling answers.
   *
   * `word` (the default): the phrase's tokens appear in the text as CONSECUTIVE tokens (`free money`
   * matches `FREE, money!`, not `money for free`), and a phrase with no letters or digits never
   * matches. `contains`: the folded phrase is a substring of the folded text, whitespace runs of both
   * collapsed to one space — also the mode for scripts written without spaces (Chinese, Japanese,
   * Thai). An empty or blank phrase never matches; an empty text matches nothing.
   */
  matched: (text: string, phrases: readonly string[], mode?: BotTextMatch) => string[]
  /**
   * A phrase list as a person typed it: every item split on commas and line breaks, each phrase
   * trimmed with inner whitespace runs collapsed to one space, empties dropped, and a phrase whose
   * folded form repeats an earlier one dropped (the first spelling kept).
   */
  phrasesOf: (input: string | readonly string[]) => string[]
}
