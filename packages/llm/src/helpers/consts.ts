import type { ModelConfig } from '../types.js'

/**
 * What a rung naming a DIFFERENT provider still takes from the rung above it: the deployment's
 * budgets. Everything else there — the secret, headers, base URL, thinking and sampling
 * switches, effort — belongs to the other provider and would be wrong, or a 400, on this one.
 */
export const PROVIDER_NEUTRAL_FIELDS = [
  'maxTokens', 'maxTokensCap', 'streamTimeout', 'cacheKey',
] as const satisfies ReadonlyArray<keyof ModelConfig>
