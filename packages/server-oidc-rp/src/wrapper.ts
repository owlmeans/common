import { AuthenFailed, AuthorizationError, AuthRole } from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { createService } from '@owlmeans/context'
import type { OIDCTokenUpdate, WrappedOIDCService } from '@owlmeans/oidc'
import { OIDC_WRAPPED_TOKEN, WRAPPED_OIDC } from '@owlmeans/oidc'
import { cache, managedId } from './utils/cache.js'
import type { Config, Context, TokenSetParameters } from './types.js'
import { authService, OIDC_AUTH_LIFTETIME, OIDC_WRAP_FRESHNESS } from './consts.js'
import days from 'dayjs'
import type { ClientModule } from '@owlmeans/client-module'
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
      const [ , authentication ] = token.split(' ')
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

        const [ update ] = await ctx.module<ClientModule<OIDCTokenUpdate>>(authService.auth.update)
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
          entityId: updatedAuth.entityId ?? user.entityId,
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

        record.payload = update.tokenSet as TokenSetParameters

        await cache(ctx).save(record, { ttl: OIDC_AUTH_LIFTETIME / 1000 })

        return { token: `${OIDC_WRAPPED_TOKEN.toUpperCase()} ${authorization}` }
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
