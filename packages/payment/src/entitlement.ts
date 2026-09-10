import { gate } from '@owlmeans/entrypoint'
import type { CommonEntrypointOptions } from '@owlmeans/entrypoint'
import type { PermissionSet } from '@owlmeans/auth'

/**
 * The gate alias a paid capability is asserted under.
 *
 * Distinct from `paymentGate.base` (a ROUTE id) and from the gateway service alias — three
 * different things that would otherwise all be called "payment gate".
 */
export const ENTITLEMENT_GATE = 'entitlement-gate'

/**
 * The capability scope that carries FEATURE flags.
 *
 * Kept apart from `renewable`, which carries numeric quotas that are consumed or counted. Merging
 * them would make "has one production slot left" and "may remove the platform credit" the same
 * number, and the first purchase that spent the quota would take the feature with it.
 */
export const CAPABILITY_FEATURE_SCOPE = 'feature'

export interface EntitlementParam {
  /** Capability scope. Absent means any scope. */
  scope?: string
  /** The permission key inside `PermissionSet.permissions`. */
  permission: string
  /** Numeric floor: `credits>=100` passes when the held value is a number at least that big. */
  atLeast?: number
}

/**
 * Grammar: `[<scope>:]<permission>[>=<n>]`.
 *
 * `feature:branding--whitelabel` · `renewable:credits>=100` · `production--standalone`
 *
 * `@` is deliberately not part of it: that is `@owlmeans/iam`'s resource-selector syntax, and a
 * grammar that reused it would make two different things look the same in a route declaration.
 */
export const parseEntitlementParam = (param: string): EntitlementParam => {
  const [scoped, floor] = param.split('>=')
  const colon = scoped.indexOf(':')
  const parsed: EntitlementParam = colon >= 0
    ? { scope: scoped.slice(0, colon), permission: scoped.slice(colon + 1) }
    : { permission: scoped }

  if (floor != null) {
    const value = Number.parseFloat(floor)
    if (!Number.isNaN(value)) {
      parsed.atLeast = value
    }
  }

  return parsed
}

export const formatEntitlementParam = (parsed: EntitlementParam): string =>
  `${parsed.scope != null ? `${parsed.scope}:` : ''}${parsed.permission}` +
  `${parsed.atLeast != null ? `>=${parsed.atLeast}` : ''}`

/**
 * Whether a union of capability sets satisfies one requirement.
 *
 * Pure, and shared by the server gate and the browser: the UI has to know whether to render a
 * control disabled, and a second implementation of the rule for the client would eventually
 * disagree with the one that actually refuses.
 *
 * A malformed parameter answers `false` rather than throwing. A gate that crashed on a typo would
 * take down the endpoint it guards, which is a strictly worse failure than refusing it.
 */
export const hasEntitlement = (
  capabilities: PermissionSet[] | undefined, param: string
): boolean => {
  if (capabilities == null || capabilities.length < 1) {
    return false
  }
  const { scope, permission, atLeast } = parseEntitlementParam(param)
  if (permission === '') {
    return false
  }

  return capabilities.some(set => {
    if (scope != null && set.scope !== scope) {
      return false
    }
    const held = set.permissions?.[permission]
    if (held == null || held === false) {
      return false
    }

    // A floor is a numeric question: a boolean flag, however true, does not answer it.
    return atLeast != null ? typeof held === 'number' && held >= atLeast : true
  })
}

/** Everything a union grants, formatted back into parameters. The wire shape of a client read. */
export const entitlementList = (capabilities: PermissionSet[] | undefined): string[] => {
  const list: string[] = []
  for (const set of capabilities ?? []) {
    for (const [permission, value] of Object.entries(set.permissions ?? {})) {
      if (value == null || value === false) {
        continue
      }
      list.push(formatEntitlementParam({ scope: set.scope, permission }))
    }
  }

  return [...new Set(list)]
}

/**
 * Declare that an entrypoint needs a paid capability.
 *
 * Sugar over `gate(ENTITLEMENT_GATE, params)` so a route reads as what it means. Several
 * parameters are OR'd, matching every other gate in the framework.
 *
 * Putting the requirement HERE rather than in a handler is the point: the framework asserts a gate
 * before the handler is entered, so the route table states what a feature costs and no new
 * endpoint can forget to check.
 */
export const entitled = (
  params: string | string[], opts?: CommonEntrypointOptions
): CommonEntrypointOptions => gate(ENTITLEMENT_GATE, params, opts)
