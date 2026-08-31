import { AuthenFailed, AuthorizationError, AuthRole } from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { createService } from '@owlmeans/context'
import type { CommonTokenSetParams, OIDCTokenUpdate, WrappedOIDCService } from '@owlmeans/oidc'
import { OIDC_WRAPPED_TOKEN, WRAPPED_OIDC } from '@owlmeans/oidc'
import { cache, managedId } from './utils/cache.js'
import type { Config, Context, OidcClientService, OidcTokenSetParameters } from './types.js'
import { authService, DEFAULT_ALIAS, OIDC_AUTH_LIFTETIME, OIDC_WRAP_FRESHNESS } from './consts.js'
import days from 'dayjs'
import { decodeJwt } from 'jose'
import { PERMISSIONS_CLAIM } from '@owlmeans/oidc'
import { extractPermissionSets } from './utils/permissions.js'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { TRUSTED } from '@owlmeans/config'
import { AUTH_SRV_KEY } from '@owlmeans/server-auth'
import { trust } from '@owlmeans/auth-common/utils'

export const makeOidcWrappingService = (): WrappedOIDCService => {
  const service = createService<WrappedOIDCService>(WRAPPED_OIDC, {
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

        if (record.validated != null && days(record.validated)
          .add(OIDC_WRAP_FRESHNESS, 'milliseconds').isAfter()) {
          return { token }
        }

        record.validated = new Date()

        if (ctx.hasEntrypoint(authService.auth.update)) {
          const [update] = await ctx.entrypoint<ClientEntrypoint<OIDCTokenUpdate>>(authService.auth.update)
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
            await cache(ctx).delete(record)
            updatedUser.token = updatedAuth.challenge
            record.id = managedId(updatedUser.token)
          }


          const trusted = await trust<Config, Context>(ctx, TRUSTED, ctx.cfg.alias ?? ctx.cfg.service)
          const authorization = await makeEnvelopeModel<Auth>(OIDC_WRAPPED_TOKEN)
            .send(updatedUser, null).sign(trusted.key, EnvelopeKind.Token)

          record.payload = update.tokenSet as OidcTokenSetParameters

          await cache(ctx).save(record, { ttl: OIDC_AUTH_LIFTETIME / 1000 })

          return { token: `${OIDC_WRAPPED_TOKEN.toUpperCase()} ${authorization}` }
        } else if (record.payload != null) {
          const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)
          const defaultClientId = oidc.getDefault()
          if (defaultClientId != null) {
            let tokenSet: CommonTokenSetParams = record.payload as CommonTokenSetParams
            const client = await oidc.getClient(defaultClientId)

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
              tokenSet = await client.refresh(tokenSet as OidcTokenSetParameters) as CommonTokenSetParams
            } else if (client.getMetadata().introspection_endpoint != null) {
              // Introspection is the only way to notice a revocation that happened before the
              // token's own expiry, so it stays the check of choice — but it is an optional
              // provider feature. Calling an endpoint the discovery document never advertised
              // throws, which would fail the session for the opposite reason to the one above.
              const result = await client.introspect(tokenSet as OidcTokenSetParameters, 'access_token')
              if (!result.active) {
                throw new AuthorizationError('access-token')
              }
            }

            const updatedUser: Auth = {
              ...user,
              createdAt: new Date()
            }

            // Keep integrated-IAM permission grants fresh across token refreshes
            if (tokenSet.id_token != null) {
              const permissions = extractPermissionSets(decodeJwt(tokenSet.id_token)[PERMISSIONS_CLAIM])
              if (permissions != null) {
                updatedUser.permissions = permissions
                updatedUser.permissioned = true
              }
            }

            const trusted = await trust<Config, Context>(ctx, TRUSTED, ctx.cfg.alias ?? ctx.cfg.service)
            const authorization = await makeEnvelopeModel<Auth>(OIDC_WRAPPED_TOKEN)
              .send(updatedUser, null).sign(trusted.key, EnvelopeKind.Token)

            record.payload = tokenSet as OidcTokenSetParameters

            await cache(ctx).save(record, { ttl: OIDC_AUTH_LIFTETIME / 1000 })

            return { token: `${OIDC_WRAPPED_TOKEN.toUpperCase()} ${authorization}` }
          }
        }
      } catch (err) {
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
