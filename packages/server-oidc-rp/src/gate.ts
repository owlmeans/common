import { createLazyService } from '@owlmeans/context'
import type { GateService } from '@owlmeans/module'
import { OIDC_GATE } from '@owlmeans/oidc'
import type { Config, Context, OidcClientService } from './types.js'
import { AuthForbidden, AuthManagerUnsupported } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { extractAuthToken } from '@owlmeans/auth-common/utils'
import { OIDC_WRAPPED_TOKEN } from '@owlmeans/oidc'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { cache, managedId } from './utils/cache.js'
import { decodeJwt } from 'jose'
import { DEFAULT_ALIAS } from './consts.js'

export const makeOidcGate = (alias: string = OIDC_GATE): GateService => {
  const service: GateService = createLazyService<GateService>(alias, {
    assert: async (req, _, params) => {
      await service.ready()
      const ctx = service.assertCtx<Config, Context>()

      const token = extractAuthToken(req, OIDC_WRAPPED_TOKEN)
      if (token == null) {
        throw new AuthForbidden('token')
      }

      const user = makeEnvelopeModel<Auth>(token, EnvelopeKind.Token).message()

      const record = await cache(ctx).get(managedId(user.token))

      if (record.payload == null) {
        throw new AuthForbidden('record')
      }

      console.log('PAYLOAD:::: ', record.payload)

      const accessToken = decodeJwt(record.payload.access_token)
      console.log(user, params, accessToken)

      const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)

      const client = await oidc.getClient({
        entityId: user.entityId,
        clientId: oidc.entityToClientId({ entityId: user.entityId })
      })

      const metadata = client.getMetadata()
      const tokenEndpoint = metadata.token_endpoint

      if (tokenEndpoint == null) {
        throw new AuthManagerUnsupported('token-url')
      }

      const cfg = client.getConfig()
      console.log('Client id: -> ', client.getClientId())
      const payload = {
        grant_type: 'urn:ietf:params:oauth:grant-type:uma-ticket',
        audience: client.getClientId(),
        client_id: client.getClientId(),
        secret: cfg.secret as string,
        // user_id: user.userId,
        subject_token: record.payload.access_token,
        permission: `sp-${user.entityId}` as string,
        response_mode: 'permissions',
      }

      const body = new URLSearchParams(payload).toString()

      
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${client.getClientId()}:${cfg.secret}`).toString('base64')}`,
        // 'Authorization': `Bearer ${record.payload.access_token}`,
        'Content-Length': `${body.length}`,
        'X-Client': 'keycloak-nodejs-connect',
      }

      try {
        const result = await fetch(tokenEndpoint, {
          method: 'POST',
          headers,
          body
        })
        const json = await result.json()
        console.log(result, json)
        console.log(JSON.stringify(decodeJwt(json.access_token), null, 2))
      } catch (e) {
        console.error('~~~~~', e)
      }
    }
  })

  return service
}
