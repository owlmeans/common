import type { PermissionSet } from '@owlmeans/auth'
import type { EntitlementParam } from '../types.js'

/** The entitlement parameter grammar and the capability predicate the server gate and the browser share. */
export interface EntitlementParamHelper {
  /**
   * Grammar: `[<scope>:]<permission>[>=<n>]`.
   *
   * `feature:branding--whitelabel` · `renewable:credits>=100` · `production--standalone`
   *
   * `@` is deliberately not part of it: that is `@owlmeans/iam`'s resource-selector syntax, and a
   * grammar that reused it would make two different things look the same in a route declaration.
   */
  parseEntitlementParam: (param: string) => EntitlementParam
  formatEntitlementParam: (parsed: EntitlementParam) => string
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
  hasEntitlement: (capabilities: PermissionSet[] | undefined, param: string) => boolean
  /** Everything a union grants, formatted back into parameters. The wire shape of a client read. */
  entitlementList: (capabilities: PermissionSet[] | undefined) => string[]
}
