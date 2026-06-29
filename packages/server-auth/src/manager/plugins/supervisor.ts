import { AuthenticationType, AuthenFailed, AuthRole, ALL_SCOPES, buildSupervisorPayload } from '@owlmeans/auth'
import type { SupervisorCredentialPayload } from '@owlmeans/auth'
import type { AuthPlugin } from './types.js'
import { base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { fromPubKey } from '@owlmeans/basic-keys'
import { TRUSTED } from '@owlmeans/config'
import type { TrustedRecord } from '@owlmeans/auth-common'
import type { AppConfig, AppContext } from '../types.js'
import type { SupervisorPluginOptions } from '../supervisor.js'

/**
 * PK-based supervisor authentication plugin. A privileged operator (or an e2e
 * test) holds one of the project's trusted private keys (the allowlisted
 * `supervisors`) and signs `buildSupervisorPayload` to mint a token for an
 * arbitrary user id / email - bypassing external IdPs. Development-only by
 * design (see `appendSupervisorAuth`).
 *
 * The plugin issues NO token itself: it only verifies the supervisor signature
 * and resolves/registers the target user, then hands the mutated credential back
 * to the existing `makeAuthModel` flow which signs the credential envelope, and
 * to the project's auth service which exchanges it for the final
 * `Ed25519BasicToken` bearer.
 */
export const makeSupervisorPlugin = (
  context: AppContext<AppConfig>, opts: SupervisorPluginOptions
): AuthPlugin => {
  const plugin: AuthPlugin = {
    type: AuthenticationType.Supervisor,

    init: async () => ({ challenge: base64.encode(randomBytes(32)) }),

    authenticate: async credential => {
      // `credential.challenge` has already been replaced by the model with the
      // unwrapped, single-use server challenge (`msg`).
      let parsed: SupervisorCredentialPayload
      try {
        parsed = JSON.parse(credential.credential) as SupervisorCredentialPayload
      } catch {
        throw new AuthenFailed('supervisor:credential')
      }
      if (parsed?.signature == null || parsed?.salt == null || credential.userId == null) {
        throw new AuthenFailed('supervisor:payload')
      }

      const payload = buildSupervisorPayload(credential.challenge, credential.userId, parsed.salt)

      let matched: string | null = null
      for (const alias of opts.supervisors) {
        try {
          const record = await context.getConfigResource(TRUSTED)
            .load<TrustedRecord>(alias, 'name')
          if (record?.credential == null) {
            continue
          }
          if (await fromPubKey(record.credential).verify(payload, parsed.signature)) {
            matched = alias
            break
          }
        } catch {
          // unknown trusted alias or verification error - try the next supervisor
        }
      }
      if (matched == null) {
        throw new AuthenFailed('supervisor:signature')
      }

      const resolution = opts.resolveUser != null
        ? await opts.resolveUser(credential.userId, context, { register: opts.allowRegistration })
        : { userId: credential.userId }

      credential.userId = resolution.userId
      credential.profileId = resolution.profileId ?? resolution.userId
      if (resolution.entityId != null) {
        credential.entityId = resolution.entityId
      }
      credential.scopes = resolution.scopes ?? credential.scopes ?? [ALL_SCOPES]
      credential.role = resolution.role ?? AuthRole.User

      const token = base64.encode(randomBytes(32))
      credential.challenge = token
      credential.type = AuthenticationType.OneTimeToken

      return { token }
    }
  }

  return plugin
}
