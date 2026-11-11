/** What {@link TokenBudgetHelper.fit} did with one part. */
export enum TokenBudgetStatus {
  /** Verbatim. */
  Kept = 'kept',
  /** Its head, cut at a paragraph or sentence boundary, closed by the omission marker. */
  Trimmed = 'trimmed',
  /** Nothing of it fitted. */
  Dropped = 'dropped',
}

/** The encoding every count uses — the one OpenAI's current models read (o200k_base). */
export const TOKEN_BUDGET_ENCODING = 'o200k_base'

/** What joins the fitted parts into one text unless the caller names another separator. */
export const TOKEN_BUDGET_SEPARATOR = '\n\n'

/**
 * Tokens per character, by class, for `estimate` — fitted on English prose, TypeScript, JSON,
 * HTML, German, Russian and Chinese against o200k_base, then leaned high by `TOKEN_ESTIMATE_MARGIN`.
 */
export const TOKEN_ESTIMATE_WEIGHTS = Object.freeze({
  /** ASCII letters. */
  letter: 0.25,
  digit: 0.35,
  /** Space, tab, line breaks. */
  space: 0.06,
  /** Other ASCII: punctuation, symbols. */
  symbol: 0.6,
  /** Non-ASCII below U+3000: Latin extensions, Cyrillic, Greek, Arabic, Hebrew … */
  extended: 0.27,
  /** CJK ideographs and punctuation, kana, Hangul, full-width forms. */
  cjk: 0.7,
  /** Anything else (emoji, other astral planes) — per code point. */
  other: 1,
})

/** How far `estimate` leans above the fitted weights. */
export const TOKEN_ESTIMATE_MARGIN = 1.05
