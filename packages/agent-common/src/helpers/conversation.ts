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
