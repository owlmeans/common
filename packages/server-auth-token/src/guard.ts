import type { Auth } from '@owlmeans/auth'
import { ALL_SCOPES, AuthroizationType } from '@owlmeans/auth'
import {
  AUTH_TOKEN_DEFAULT_PREFIX, AUTH_TOKEN_SCHEME, AUTH_TOKEN_RESOURCE, AUTH_TOKEN_TOUCH_INTERVAL,
  BEARER_SCHEME, GUARD_AUTH_TOKEN, isAccessToken, parseAuthorizationHeader
} from '@owlmeans/auth-token'
import { AUTH_HEADER } from '@owlmeans/auth'
import { ENTITY_RESOLVER } from '@owlmeans/auth-common'
import type { EntityResolverService } from '@owlmeans/auth-common'
import { createService } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse, GuardService } from '@owlmeans/entrypoint'
import { AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityProfile, IdentityProfileResource } from '@owlmeans/server-auth-identity'
import { hashAccessToken } from './hash.js'
import type { AccessTokenResource, AuthTokenConfig, AuthTokenContext, AuthTokenGuardOptions } from './types.js'

/** Where the deployment's prefix comes from: the guard's own options, then config, then default. */
export const prefixOf = (context: AuthTokenContext, opts?: AuthTokenGuardOptions): string =>
  opts?.prefix ?? (context.cfg as AuthTokenConfig).authToken?.prefix ?? AUTH_TOKEN_DEFAULT_PREFIX

/**
 * The guard that verifies a long-lived access token.
 *
 * It is a GUARD, not an authentication method: nothing is exchanged, no envelope is signed, no
 * session begins. A caller presents a credential it was handed once, and the guard turns it into
 * the same `Auth` payload every other guard produces — so ownership gates, entitlement gates and
 * handlers written against a browser session work unchanged for an API client.
 *
 * Three properties are what keep it from colliding with the guards it sits beside:
 *
 * - it claims a header only when the value carries the deployment's prefix, so an OwlMeans
 *   `ED25519-BASIC-TOKEN` bearer, an OIDC one, and this one can all arrive under `Authorization`
 *   without any of them shadowing the others;
 * - it accepts the OwlMeans `AUTH-TOKEN` scheme AND plain `Bearer`, because a third-party client
 *   configured with a URL sends the latter whatever the documentation says;
 * - it intersects the token's scopes with its profile's on every request, so a token can never
 *   outlive or outrank the person who minted it.
 */
export const makeAuthTokenGuard = (
  alias: string = GUARD_AUTH_TOKEN, opts: AuthTokenGuardOptions = {}
): GuardService => {
  const touchInterval = opts.touchInterval ?? AUTH_TOKEN_TOUCH_INTERVAL

  const present = (req: Partial<AbstractRequest>, prefix: string): string | null => {
    const parsed = parseAuthorizationHeader(req.headers?.[AUTH_HEADER])
    if (parsed == null) return null
    if (parsed.scheme !== AUTH_TOKEN_SCHEME && parsed.scheme !== BEARER_SCHEME) return null

    return isAccessToken(parsed.value, prefix) ? parsed.value : null
  }

  const service: GuardService = createService<GuardService>(alias, {
    match: async req => {
      const context = service.assertCtx<AuthTokenConfig, AuthTokenContext>()
      if (req == null) return false
      // A denied route refuses the credential outright. The refusal has to happen here rather
      // than in the handler: a guard appended to a base reaches every child, and a child cannot
      // drop what it inherited — so the only place left to say "not with this credential" is the
      // moment the guard decides whether the request is its business at all.
      if (opts.denyAliases != null && req.alias != null && opts.denyAliases.includes(req.alias)) {
        return false
      }

      return present(req, prefixOf(context, opts)) != null
    },

    handle: async <T>(req: AbstractRequest, res: AbstractResponse<Auth>) => {
      const context = service.assertCtx<AuthTokenConfig, AuthTokenContext>()
      const prefix = prefixOf(context, opts)
      const presented = present(req, prefix)
      if (presented == null) return false as T

      const tokens = context.resource<AccessTokenResource>(opts.resourceAlias ?? AUTH_TOKEN_RESOURCE)
      const record = await tokens.load({ hash: hashAccessToken(presented) })
      if (record == null) return false as T
      if (record.revokedAt != null) return false as T
      if (record.expiresAt != null && new Date(record.expiresAt) < new Date()) return false as T

      // A token is only ever as good as the profile behind it. Reading the profile per request is
      // what makes revoking a person's access revoke every token they ever minted, without any
      // token record being touched.
      const profiles = context.resource<IdentityProfileResource>(
        opts.profileAlias ?? AUTH_IDENTITY_PROFILE
      )
      let profile: IdentityProfile | null = null
      try {
        profile = await profiles.load({ entityId: record.entityId, profileId: record.profileId })
      } catch {
        return false as T
      }
      if (profile == null) return false as T
      if (profile.expiresAt != null && new Date(profile.expiresAt) < new Date()) return false as T

      const profileScopes = profile.scopes ?? []
      const scopes = profileScopes.includes(ALL_SCOPES)
        ? record.scopes
        : record.scopes.includes(ALL_SCOPES)
          ? profileScopes
          : record.scopes.filter(scope => profileScopes.includes(scope))

      // `attachEntity` canonicalizes whatever it is given, but it resolves by NAME — so writing
      // the current slug here costs one cached read and keeps the payload identical to the one a
      // browser session produces.
      let entitySlug = record.entityId
      if (context.hasService(ENTITY_RESOLVER)) {
        const resolver = context.service<EntityResolverService>(ENTITY_RESOLVER)
        const entity = await resolver.byId(record.entityId)
        if (entity != null) entitySlug = entity.slug
      }

      res.resolve({
        // Never the secret: what a downstream reader sees is the display form, which is what a
        // log or an audit trail can safely carry.
        token: record.display,
        type: AuthroizationType.AuthToken,
        role: profile.role,
        userId: record.userId,
        profileId: record.profileId,
        entitySlug,
        scopes,
        isUser: true,
        source: context.cfg.service,
        createdAt: new Date(record.createdAt),
        ...(record.expiresAt != null ? { expiresAt: new Date(record.expiresAt) } : {}),
      } as Auth)

      const last = record.lastUsedAt == null ? 0 : new Date(record.lastUsedAt).getTime()
      if (Date.now() - last > touchInterval) {
        // Fire and forget: a usage timestamp is never a reason to fail a request, and awaiting it
        // would put a database write on the critical path of every authenticated call.
        void tokens.save({ ...record, lastUsedAt: new Date() })
          .catch((e: unknown) => console.error('auth-token: lastUsedAt', e))
      }

      return true as T
    },

    /** Server-side guard: it verifies what arrives, it never produces a credential. */
    authenticated: async () => null,
  })

  return service
}
