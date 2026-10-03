import { AuthenFailed, AuthorizationError, AuthRole, AuthUnavailable } from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { createService } from '@owlmeans/context'
import type { CommonTokenSetParams, OIDCTokenUpdate, WrappedOIDCService, WrappedOIDCUpdate } from '@owlmeans/oidc'
import { ORGANIZATIONS_CLAIM, WRAPPED_OIDC } from '@owlmeans/oidc'
import { cache, managedId, sessionTtl } from './utils/cache.js'
import type { OIDCAuthCache } from './utils/types.js'
import type { Config, Context, OidcClientService, OidcTokenSetParameters } from './types.js'
import { authService, DEFAULT_ALIAS, OIDC_WRAP_FRESHNESS } from './consts.js'
import days from 'dayjs'
import { decodeJwt } from 'jose'
import { PERMISSIONS_CLAIM } from '@owlmeans/oidc'
import { extractPermissionSets } from './utils/permissions.js'
import {
  actingAuth, actingPermissionSets, extractOrganizations, pickOrganization, resolvedEntityOf,
} from './utils/organization.js'
import { signWrapped } from './utils/wrapped.js'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { TRUSTED } from '@owlmeans/config'
import { AUTH_SRV_KEY } from '@owlmeans/server-auth'
import { trust } from '@owlmeans/auth-common/utils'
import { AUTH_SESSION_MANAGER } from '@owlmeans/server-auth-session'
import type { AuthSessionDecision, AuthSessionManager } from '@owlmeans/server-auth-session'

/** Provider errors which affirm that this access token is no longer usable. */
const isInvalidProviderToken = (error: unknown): boolean => {
  if (error == null || typeof error !== 'object') return false
  const candidate = error as {
    error?: unknown
    status?: unknown
    cause?: unknown
  }
  if (candidate.error === 'invalid_token' || candidate.error === 'invalid_grant') return true
  if (candidate.status !== 401 || !Array.isArray(candidate.cause)) return false
  return candidate.cause.some(challenge => (
    challenge != null
    && typeof challenge === 'object'
    && (challenge as { parameters?: { error?: unknown } }).parameters?.error === 'invalid_token'
  ))
}

const sessionFailure = (decision: AuthSessionDecision): never => {
  if (decision.state === 'pending') throw new AuthUnavailable('session-registry')
  throw new AuthorizationError('session')
}

/** The guard attaches the acting organization only for a session that acts in one. */
const updateOf = (token: string, record: OIDCAuthCache): WrappedOIDCUpdate =>
  record.acting != null && record.entity != null ? { token, entity: record.entity } : { token }

export const makeOidcWrappingService = (): WrappedOIDCService => {
  const service: WrappedOIDCService = createService<WrappedOIDCService>(WRAPPED_OIDC, {
    update: async (token, thr) => {
      const ctx = service.assertCtx<Config, Context>()
      token = typeof token === 'string' ? token : token?.token
      if (token == null) {
        throw new AuthorizationError('token')
      }
      const [, authentication] = token.split(' ')
      const envelope = makeEnvelopeModel<Auth>(authentication, EnvelopeKind.Token)
      const user = envelope.message()

      try {
        const record = await cache(ctx).get(managedId(user.token))
        if (record == null || record.payload == null) {
          throw new AuthorizationError('record')
        }
        const remainingTtl = sessionTtl(record.expiresAt)

        const manager = ctx.hasService(AUTH_SESSION_MANAGER)
          ? ctx.service<AuthSessionManager>(AUTH_SESSION_MANAGER)
          : null
        let sessionDecision: AuthSessionDecision | null = null
        if (manager != null) {
          // Sessions issued before the registry rollout lack this id. Rejecting them makes the
          // deployment boundary explicit instead of leaving untracked seven-day wrappers live.
          if (user.sessionId == null) throw new AuthorizationError('session')
          try {
            sessionDecision = await manager.inspect(user.sessionId)
          } catch {
            throw new AuthUnavailable('session-registry')
          }
          if (sessionDecision.state !== 'active' && sessionDecision.state !== 'refresh') {
            sessionFailure(sessionDecision)
          }
        }

        const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)
        const configuredClientId = record.client ?? oidc.getDefault()
        if (configuredClientId == null) {
          throw new AuthUnavailable('oidc-client')
        }
        const client = await oidc.getClient(configuredClientId)
        const validateEveryRequest = client.getConfig().sessionValidation === 'required'

        if (!validateEveryRequest && record.validated != null && days(record.validated)
          .add(OIDC_WRAP_FRESHNESS, 'milliseconds').isAfter() && sessionDecision?.state !== 'refresh') {
          return updateOf(token, record)
        }

        record.validated = new Date()

        if (ctx.hasEntrypoint(authService.auth.update)) {
          const update = await ctx.entrypoint<ClientEntrypoint<OIDCTokenUpdate>>(authService.auth.update)
            .call({ body: { token, tokenSet: record.payload } })

          const updateEnvelope = makeEnvelopeModel<AuthCredentials>(update.token, EnvelopeKind.Token)
          const authManager = await trust<Config, Context>(ctx, TRUSTED, AUTH_SRV_KEY)
          if (!await updateEnvelope.verify(authManager.key)) {
            throw new AuthenFailed()
          }

          const updatedAuth = updateEnvelope.message()

          const updatedUser: Auth = {
            ...user,
            role: updatedAuth.role ?? AuthRole.Guest,
            userId: updatedAuth.userId ?? user.userId,
            profileId: updatedAuth.profileId,
            entitySlug: updatedAuth.entitySlug ?? user.entitySlug,
            createdAt: new Date()
          }

          if (updatedAuth.challenge !== user.token) {
            await cache(ctx).delete(managedId(user.token))
            updatedUser.token = updatedAuth.challenge
            record.id = managedId(updatedUser.token)
            updatedUser.sessionId = record.id
          }

          if (manager != null && (sessionDecision?.state === 'refresh' || updatedUser.sessionId !== user.sessionId)) {
            if (record.entityId == null || record.profileId == null || updatedUser.sessionId == null) {
              throw new AuthorizationError('session')
            }
            let registered: AuthSessionDecision
            try {
              registered = await manager.register({
                id: updatedUser.sessionId, kind: 'oidc-access', entityId: record.entityId,
                profileId: record.profileId, issuedAt: user.createdAt?.getTime(), expiresAt: record.expiresAt,
              })
            } catch {
              throw new AuthUnavailable('session-registry')
            }
            if (registered.state !== 'active') sessionFailure(registered)
            else updatedUser.authorizationVersion = registered.version
          }

          const issued = await signWrapped(ctx, updatedUser)

          record.payload = update.tokenSet as OidcTokenSetParameters

          await cache(ctx).save(record, { ttl: remainingTtl })

          return updateOf(issued, record)
        } else if (record.payload != null) {
          if (configuredClientId != null) {
            let tokenSet: CommonTokenSetParams = record.payload as CommonTokenSetParams

            // Revalidate using only what this session and this provider actually support.
            // `expires_at` is the token set's own absolute expiry; **absent is not expired** —
            // reading a missing value as the epoch (the former `?? 0`) sent every single
            // validation, including one moments after login, down the refresh path. That path
            // cannot work for a session granted without `offline_access`, because such a token
            // set carries no refresh token at all, so a valid login died as a 403.
            const expiresAt = tokenSet.expires_at
            if (expiresAt != null && days.unix(expiresAt).isBefore()) {
              if (tokenSet.refresh_token == null) {
                // Expired with nothing to renew it — the user has to authenticate again.
                throw new AuthorizationError('access-token')
              }
              try {
                tokenSet = await client.refresh(tokenSet as OidcTokenSetParameters) as CommonTokenSetParams
              } catch (error) {
                if (isInvalidProviderToken(error)) throw new AuthorizationError('access-token')
                if (validateEveryRequest) throw new AuthUnavailable('oidc-refresh')
                throw error
              }
            } else if (client.getMetadata().introspection_endpoint != null) {
              // Introspection is the only way to notice a revocation that happened before the
              // token's own expiry, so it stays the check of choice — but it is an optional
              // provider feature. Calling an endpoint the discovery document never advertised
              // throws, which would fail the session for the opposite reason to the one above.
              let result
              try {
                result = await client.introspect(tokenSet as OidcTokenSetParameters, 'access_token')
              } catch (error) {
                if (validateEveryRequest) throw new AuthUnavailable('oidc-introspection')
                throw error
              }
              if (!result.active) {
                throw new AuthorizationError('access-token')
              }
            } else if (validateEveryRequest) {
              // A deployment that declares the provider authoritative cannot silently fall
              // back to a signed, stale local claim when the required live check is absent.
              throw new AuthUnavailable('oidc-introspection')
            }

            let updatedUser: Auth = {
              ...user,
              createdAt: new Date()
            }

            // The provider's current word on the subject: userinfo where the provider is the
            // authority on every request, the (possibly refreshed) id_token otherwise. Keeps
            // integrated-IAM permission grants and organizations fresh across token refreshes.
            let claims: Record<string, unknown> | undefined = tokenSet.id_token != null
              ? decodeJwt(tokenSet.id_token)
              : undefined

            if (validateEveryRequest) {
              let current: Record<string, unknown>
              try {
                current = await client.userinfo(tokenSet as OidcTokenSetParameters, user.userId)
              } catch (error) {
                // An active token that cannot be checked against the provider is an authority
                // outage, but an `invalid_token` response is an explicit authorization refusal.
                if (isInvalidProviderToken(error)) throw new AuthorizationError('access-token')
                throw new AuthUnavailable('oidc-userinfo')
              }
              if (extractPermissionSets(current[PERMISSIONS_CLAIM]) == null) {
                throw new AuthorizationError('permissions')
              }
              claims = current
            }

            const sets = claims != null ? extractPermissionSets(claims[PERMISSIONS_CLAIM]) : undefined

            if (record.acting != null) {
              // A session that acts in an organization keeps exactly that one, followed by its
              // frozen key across renames. Gone from the provider's answer means the subject left
              // it — never a silent move into another organization.
              const organizations = claims != null
                ? extractOrganizations(claims[ORGANIZATIONS_CLAIM])
                : record.organizations
              const acting = organizations != null
                ? pickOrganization(organizations, { entityKey: record.acting })
                : undefined
              if (acting == null) {
                throw new AuthorizationError('entity')
              }

              record.organizations = organizations
              record.sets = sets ?? record.sets
              record.entity = resolvedEntityOf(acting)
              updatedUser = actingAuth(updatedUser, acting, record.sets)
            } else if (sets != null) {
              updatedUser.permissions = actingPermissionSets(sets)
              updatedUser.permissioned = true
            }

            if (manager != null && sessionDecision?.state === 'refresh') {
              if (record.entityId == null || record.profileId == null || user.sessionId == null) {
                throw new AuthorizationError('session')
              }
              let registered: AuthSessionDecision
              try {
                registered = await manager.register({
                  id: user.sessionId, kind: 'oidc-access', entityId: record.entityId,
                  profileId: record.profileId, issuedAt: user.createdAt?.getTime(), expiresAt: record.expiresAt,
                })
              } catch {
                throw new AuthUnavailable('session-registry')
              }
              if (registered.state !== 'active') sessionFailure(registered)
              else updatedUser.authorizationVersion = registered.version
            }

            const issued = await signWrapped(ctx, updatedUser)

            record.payload = tokenSet as OidcTokenSetParameters

            await cache(ctx).save(record, { ttl: remainingTtl })

            return updateOf(issued, record)
          }
        }
      } catch (err) {
        if (err instanceof AuthUnavailable) {
          // Preserve the session record: this is a dependency outage, and clearing a valid
          // browser session would turn a recoverable outage into forced reauthentication.
          throw err
        }
        console.error(err)
        await cache(ctx).delete(managedId(user.token))
        if (thr) {
          if (err instanceof AuthorizationError) {
            throw err
          }
          throw new AuthorizationError('unknown')
        }
      }
      return null
    }
  })

  return service
}
