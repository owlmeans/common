import type { MessageFieldWithRole } from '@langchain/core/messages'
import type { ModelInput } from '../types.js'

/**
 * Normalize whatever a caller passed as input into an array of role-tagged messages:
 * a bare string becomes a `user` message, a single message becomes a one-element array.
 * The result is a fresh array the model is free to mutate (JSON directive, `/no_think`,
 * cache markers) without touching the caller's data.
 */
export const normalizeInput = (input: ModelInput): MessageFieldWithRole[] =>
  (Array.isArray(input) ? input : [input])
    .map(message => typeof message === 'string' ? { role: 'user' as const, content: message } : message) as MessageFieldWithRole[]
