import type { MessageFieldWithRole } from '@langchain/core/messages'
import type { ModelInput } from '../types.js'
import { messageUtils } from '../utils/messages.js'

/**
 * Normalize whatever a caller passed as input into an array of role-tagged messages:
 * a bare string becomes a `user` message, a single message becomes a one-element array.
 *
 * Every message is a COPY — the same class (a langchain message keeps its prototype) with a fresh
 * content array — so the model may prepare it in place (blank-content cleanup, the tail, the JSON
 * directive, cache markers) without touching what the caller holds. A caller that carries its
 * conversation across calls gets it back exactly as it built it.
 */
export const normalizeInput = (input: ModelInput): MessageFieldWithRole[] =>
  (Array.isArray(input) ? input : [input])
    .map(message => typeof message === 'string'
      ? { role: 'user' as const, content: message }
      : messageUtils.copy(message as MessageFieldWithRole)) as MessageFieldWithRole[]
