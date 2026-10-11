/**
 * Cut `text` to `max` characters on a boundary a reader will not trip over.
 *
 * Every cap in this package lands here, because a model asked for "at most N characters" answers
 * with N plus whatever it felt was needed. Truncating mid-word reads as corruption and truncating
 * mid-sentence reads as a bug report, so the cut prefers the last paragraph, then line, then
 * sentence, then word break inside the last quarter of the budget, and always marks itself.
 */
export const truncateAt = (text: string, max: number): string => {
  const trimmed = text.trim()
  if (trimmed.length <= max) {
    return trimmed
  }
  if (max <= 1) {
    return trimmed.slice(0, Math.max(0, max))
  }

  const ellipsis = '…'
  const budget = max - ellipsis.length
  const head = trimmed.slice(0, budget)
  const floor = Math.floor(budget * 0.75)

  for (const boundary of ['\n\n', '\n', '. ', ' ']) {
    const at = head.lastIndexOf(boundary)
    if (at >= floor) {
      return head.slice(0, boundary === '. ' ? at + 1 : at).trimEnd() + ellipsis
    }
  }

  return head.trimEnd() + ellipsis
}
