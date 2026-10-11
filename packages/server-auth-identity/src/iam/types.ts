import type { AuthPayload } from '@owlmeans/auth'

/** Find-or-create an end-user identity scoped to an entity by email address.
 *
 *  Used by the OTP auth plugin: after code verification, look up whether this
 *  email already has a profile under the entity and create one if not.
 */
export interface EmailIdentityArgs {
  email: string
  /** The entity (project owner) this login is scoped to */
  entityId?: string
  /** Human-readable display name (defaults to email) */
  username?: string
}

/** Result matches AuthPayload so it can be embedded directly in the credential. */
export type EmailIdentityPayload = AuthPayload

/** Extension seam for IAM-backed identity operations — Phase 2 fills this */
export interface IdentityIamExtension {
  /** Inputs and result types for the email find-or-create path */
  EmailIdentityArgs: EmailIdentityArgs
  EmailIdentityPayload: EmailIdentityPayload
}
