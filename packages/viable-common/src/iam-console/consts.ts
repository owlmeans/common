/**
 * The marker an IAM refusal of an owner-console change carries, stored or thrown — the platform's
 * `IamRefused` (409) writes `iam-refused:<the IAM's own marker>`, and every reader (the browser, the
 * connector's tools) phrases the refusal from it.
 */
export const IAM_REFUSED = 'iam-refused'

/**
 * The IAM vocabulary a consumer of the owner console contract needs, re-exported: the contract is
 * what every runtime imports, and a web app or a connector has no `@owlmeans/iam` dependency of its
 * own — reaching the enums through hoisting works only by accident of the install layout.
 */
export {
  IamDefaultClass, IamGrantMode, IamGrantOrigin, IamRemovalPolicy, IAM_AREAS, IAM_MEMBERS_GROUP,
} from '@owlmeans/iam'
