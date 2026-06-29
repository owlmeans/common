/**
 * Canonical payload that the PK-based supervisor auth flow signs on the front-end
 * (with a supervisor's private key) and re-builds on the back-end for
 * verification. Shared by `@owlmeans/server-auth` (verify) and the web client
 * plugin (sign) so both sides agree byte-for-byte.
 *
 * It binds the signature to:
 * - the one-time server `challenge` (cached/single-use) so a captured signature
 *   cannot be replayed in another session,
 * - the target `userId` (email) being authenticated,
 * - a fresh client `salt`.
 */
export const buildSupervisorPayload = (
  challenge: string, userId: string, salt: string
): { challenge: string, userId: string, salt: string } => ({ challenge, userId, salt })

/**
 * Shape of the value packed into `AuthCredentials.credential` by the supervisor
 * web plugin: the client `salt` plus the `signature` over `buildSupervisorPayload`.
 */
export interface SupervisorCredentialPayload {
  salt: string
  signature: string
}
