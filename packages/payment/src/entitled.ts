import type { EntrypointOptions } from '@owlmeans/entrypoint'
import { ENTITLEMENT_GATE } from './consts.js'

/**
 * Declare that an entrypoint needs a paid capability.
 *
 * Compatibility sugar over the protocol option
 * `{ gate: { alias: ENTITLEMENT_GATE, params } }` so a route reads as what it means. Several
 * parameters are OR'd, matching every other gate in the framework.
 *
 * Putting the requirement HERE rather than in a handler is the point: the framework asserts a gate
 * before the handler is entered, so the route table states what a feature costs and no new
 * endpoint can forget to check.
 */
export const entitled = (
  params: string | string[], opts?: EntrypointOptions,
): EntrypointOptions => ({
  ...opts,
  gate: { alias: ENTITLEMENT_GATE, params },
})
