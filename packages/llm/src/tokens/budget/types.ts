import type { TokenBudgetStatus } from './consts.js'

/** One piece of text competing for a token budget. */
export interface TokenBudgetPart {
  /** The caller's name for the part — echoed back and named in its omission marker. */
  id: string
  text: string
  /** Higher is placed first. Parts of one priority share what is left between them. */
  priority: number
  /**
   * The fewest tokens of this part worth keeping: a trim that would leave less (the marker not
   * counted) drops the part instead. Default 1.
   */
  minTokens?: number
}

/** What happened to one part. */
export interface TokenBudgetEntry {
  id: string
  priority: number
  status: TokenBudgetStatus
  /** The text as fitted: the original, its head and the omission marker, or `''`. */
  text: string
  /** Tokens of {@link text}. */
  tokens: number
  /** Tokens of the original text. */
  original: number
}

/** The outcome of {@link TokenBudgetHelper.fit}. */
export interface TokenBudgetFit {
  budget: number
  /** Every kept and trimmed part, in INPUT order, joined by the separator. */
  text: string
  /** Tokens of {@link text} — never above the budget. */
  tokens: number
  /** Every part, in input order. */
  parts: TokenBudgetEntry[]
  /** Ids by outcome, in input order. */
  kept: string[]
  trimmed: string[]
  dropped: string[]
}

/** What a trimmed part's marker is written from. */
export interface TokenBudgetOmission {
  id: string
  /** Tokens of the original text left out. */
  omitted: number
}

export interface TokenBudgetFitOptions {
  /** Joins the fitted parts in {@link TokenBudgetFit.text}; counted against the budget. Default `\n\n`. */
  separator?: string
  /**
   * The explicit omission marker appended to a trimmed part. Default
   * `\n\n[… <n> tokens of "<id>" omitted …]`. It must not grow with a smaller count.
   */
  marker?: (omission: TokenBudgetOmission) => string
}

/**
 * Token counts and a budget for prompt text — pure and deterministic. Counts use o200k_base
 * (`gpt-tokenizer`), the encoding OpenAI's current models read; for an Anthropic or other model it
 * is an approximation, so keep a margin under that model's real window.
 */
export interface TokenBudgetHelper {
  /** Exact token count. */
  count: (text: string) => number
  /**
   * A fast estimate from character classes, no tokenizer — within about a fifth of `count` on prose,
   * code, JSON, Cyrillic and CJK, leaning high. Never for a hard limit.
   */
  estimate: (text: string) => number
  /** Whether `text` fits `budget` tokens; stops counting once it does not. */
  within: (text: string, budget: number) => boolean
  /**
   * Fit parts into `budget` tokens. Highest priority first, each priority group verbatim when it
   * fits; otherwise the group shares what is left — a part under its fair share stays verbatim, the
   * rest are trimmed to the head that fits (whole paragraphs, then whole sentences of the next one)
   * plus an explicit omission marker, and a part with no whole sentence (or under `minTokens`) left
   * is dropped. Lower priorities get what remains. The same parts always give the same answer.
   */
  fit: (parts: readonly TokenBudgetPart[], budget: number, options?: TokenBudgetFitOptions) => TokenBudgetFit
}
