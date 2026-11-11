import { countTokens, isWithinTokenLimit } from 'gpt-tokenizer/encoding/o200k_base'
import { TOKEN_ESTIMATE_MARGIN, TOKEN_ESTIMATE_WEIGHTS, TOKEN_BUDGET_SEPARATOR, TokenBudgetStatus } from './budget/consts.js'
import { ENCODE_OPTIONS, LINE_BREAK, PARAGRAPH_BREAK, SENTENCE_END } from './budget/consts.local.js'
import type { TokenBudgetHelper, TokenBudgetOmission, TokenBudgetPart } from './budget/types.js'
import type { FittingPart, TrimmedText } from './budget/types.local.js'

export const createTokenBudgetHelper = (): TokenBudgetHelper => {
  const count = (text: string): number => text === '' ? 0 : countTokens(text, ENCODE_OPTIONS)

  const within = (text: string, budget: number): boolean =>
    budget >= 0 && (text === '' || isWithinTokenLimit(text, budget, ENCODE_OPTIONS) !== false)

  const estimate = (text: string): number => {
    let sum = 0
    for (const char of text) {
      const code = char.codePointAt(0)!
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) sum += TOKEN_ESTIMATE_WEIGHTS.letter
      else if (code >= 48 && code <= 57) sum += TOKEN_ESTIMATE_WEIGHTS.digit
      else if (code === 32 || code === 9 || code === 10 || code === 13) sum += TOKEN_ESTIMATE_WEIGHTS.space
      else if (code < 128) sum += TOKEN_ESTIMATE_WEIGHTS.symbol
      else if ((code >= 0x3000 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af)
        || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef)) sum += TOKEN_ESTIMATE_WEIGHTS.cjk
      else if (code < 0x3000) sum += TOKEN_ESTIMATE_WEIGHTS.extended
      else sum += TOKEN_ESTIMATE_WEIGHTS.other
    }
    return Math.ceil(sum * TOKEN_ESTIMATE_MARGIN)
  }

  const defaultMarker = ({ id, omitted }: TokenBudgetOmission): string => `\n\n[… ${omitted} tokens of "${id}" omitted …]`

  /** The last cut whose head fits; 0 when none does. Cuts ascend, and a longer head never counts fewer tokens. */
  const largest = (cuts: number[], fits: (cut: number) => boolean): number => {
    let low = 0
    let high = cuts.length - 1
    let found = 0
    while (low <= high) {
      const middle = (low + high) >> 1
      if (fits(cuts[middle]!)) {
        found = cuts[middle]!
        low = middle + 1
      } else {
        high = middle - 1
      }
    }
    return found
  }

  /** The head of a part that fits `allowance` tokens with its marker — whole paragraphs, then whole sentences or lines. */
  const trim = (
    part: TokenBudgetPart, original: number, allowance: number, marker: (omission: TokenBudgetOmission) => string,
  ): TrimmedText | undefined => {
    const floor = Math.max(1, part.minTokens ?? 1)
    // The marker is sized for the most it could ever say, so the real one never needs more room.
    const room = allowance - count(marker({ id: part.id, omitted: original }))
    if (room < floor) return undefined
    const text = part.text
    const fits = (cut: number): boolean => within(text.slice(0, cut).trimEnd(), room)
    const paragraphs = [...text.matchAll(PARAGRAPH_BREAK)].map(match => match.index).filter(at => at > 0)
    let cut = largest(paragraphs, fits)
    const next = paragraphs.find(at => at > cut) ?? text.length
    // Inside the paragraph that no longer fits: whole sentences, or whole lines of a list.
    const inside = text.slice(cut, next)
    const sentences = [...new Set([
      ...[...inside.matchAll(SENTENCE_END)].map(match => cut + match.index + match[0].length),
      ...[...inside.matchAll(LINE_BREAK)].map(match => cut + match.index),
    ])].filter(at => at > cut && at < next).sort((a, b) => a - b)
    cut = Math.max(cut, largest(sentences, fits))
    const head = text.slice(0, cut).trimEnd()
    const kept = count(head)
    if (head === '' || kept < floor) return undefined
    const fitted = `${head}${marker({ id: part.id, omitted: Math.max(0, original - kept) })}`

    return { text: fitted, tokens: count(fitted) }
  }

  const fit: TokenBudgetHelper['fit'] = (parts, budget, options = {}) => {
    const separator = options.separator ?? TOKEN_BUDGET_SEPARATOR
    const marker = options.marker ?? defaultMarker
    const gap = count(separator)
    const entries: FittingPart[] = parts.map((part, index) => ({
      part, index, original: count(part.text), status: TokenBudgetStatus.Dropped, text: '', tokens: 0,
    }))
    /** A placed part pays for the separator in front of it; the first one's is refunded up front. */
    const costOf = (tokens: number): number => tokens === 0 ? 0 : tokens + gap
    const keep = (entry: FittingPart): void => {
      entry.status = TokenBudgetStatus.Kept
      entry.text = entry.part.text
      entry.tokens = entry.original
    }
    const place = (entry: FittingPart, trimmed: TrimmedText | undefined): void => {
      entry.status = trimmed != null ? TokenBudgetStatus.Trimmed : TokenBudgetStatus.Dropped
      entry.text = trimmed?.text ?? ''
      entry.tokens = trimmed?.tokens ?? 0
    }

    let left = Math.max(0, budget) + gap
    const priorities = [...new Set(entries.map(entry => entry.part.priority))].sort((a, b) => b - a)
    for (const priority of priorities) {
      const group = entries.filter(entry => entry.part.priority === priority)
      const need = group.reduce((sum, entry) => sum + costOf(entry.original), 0)
      if (need <= left) {
        group.forEach(keep)
        left -= need
        continue
      }
      // Water-filling: a part under its fair share of what is left stays verbatim.
      const over: FittingPart[] = []
      const bySize = [...group].sort((a, b) => a.original - b.original || a.index - b.index)
      bySize.forEach((entry, at) => {
        if (over.length === 0 && costOf(entry.original) <= Math.floor(left / (bySize.length - at))) {
          keep(entry)
          left -= costOf(entry.original)
        } else {
          over.push(entry)
        }
      })
      over.sort((a, b) => a.index - b.index)
      const share = Math.floor(left / over.length)
      const allowances = over.map((_, at) => share + (at < left - share * over.length ? 1 : 0) - gap)
      over.forEach((entry, at) => {
        place(entry, allowances[at]! > 0 ? trim(entry.part, entry.original, allowances[at]!, marker) : undefined)
        left -= costOf(entry.tokens)
      })
      left = Math.max(0, left)
    }

    const join = (): string => entries
      .filter(entry => entry.status !== TokenBudgetStatus.Dropped && entry.text !== '')
      .map(entry => entry.text)
      .join(separator)
    let text = join()
    let tokens = count(text)
    // Joined text may count a token or two more than its parts did; the lowest priority gives way.
    while (tokens > budget) {
      const victim = entries
        .filter(entry => entry.status !== TokenBudgetStatus.Dropped && entry.tokens > 0)
        .sort((a, b) => a.part.priority - b.part.priority || b.index - a.index)[0]
      if (victim == null) break
      const allowance = victim.tokens - (tokens - budget)
      place(victim, allowance > 0 ? trim(victim.part, victim.original, allowance, marker) : undefined)
      text = join()
      tokens = count(text)
    }

    const ids = (status: TokenBudgetStatus): string[] => entries.filter(entry => entry.status === status).map(entry => entry.part.id)

    return {
      budget,
      text,
      tokens,
      parts: entries.map(entry => ({
        id: entry.part.id, priority: entry.part.priority, status: entry.status,
        text: entry.text, tokens: entry.tokens, original: entry.original,
      })),
      kept: ids(TokenBudgetStatus.Kept),
      trimmed: ids(TokenBudgetStatus.Trimmed),
      dropped: ids(TokenBudgetStatus.Dropped),
    }
  }

  return { count, estimate, within, fit }
}

export const tokenBudgetHelper = createTokenBudgetHelper()
