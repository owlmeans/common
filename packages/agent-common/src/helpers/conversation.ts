import type { LlmPurpose } from '@owlmeans/llm-common'
import { SCOPE_SEP } from '../consts.js'
import type { ConversationRef } from '../types.js'

/**
 * The conversation a run belongs to.
 *
 * An LLM purpose already carries the only correlation key most applications have — `dedication`,
 * conventionally `<kind>:<id>`. Deriving the conversation from it means an application gets
 * continuity without inventing and threading a second identifier, and two runs dedicated to the
 * same subject land in the same conversation by construction.
 *
 * The scope is the dedication's TARGET rather than the whole string, so conversations addressed at
 * different granularities (a project, one of its stories) still share the subject their memory is
 * filed under. Both halves can be overridden for an application whose threads are not one per
 * dedication.
 */
export const conversationFor = (
  purpose: LlmPurpose | undefined,
  override?: Partial<ConversationRef>,
): ConversationRef => {
  const dedication = purpose?.dedication ?? ''
  const separator = dedication.indexOf(SCOPE_SEP)
  const target = separator < 0 ? dedication : dedication.slice(separator + 1)

  return {
    conversationId: override?.conversationId ?? (dedication !== '' ? dedication : 'anonymous'),
    scope: override?.scope ?? (target !== '' ? target : 'anonymous'),
  }
}

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
