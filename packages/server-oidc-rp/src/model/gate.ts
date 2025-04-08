import { AuthForbidden, AuthManagerError, AuthManagerUnsupported, AuthUnknown } from '@owlmeans/auth'
import { authService, DEFAULT_ALIAS } from '../consts.js'
import type { Config, Context, OidcClientService } from '../types.js'
import { cache, managedId } from '../utils/cache.js'
import type { GateModel, PermissionRequest, PermissionResponse } from './types.js'
import { ResponseMode } from './consts.js'
import type { ClientModule } from '@owlmeans/client-module'
import type { OidcProviderDescriptor } from '@owlmeans/oidc'

export const createGateModel = <C extends Config, T extends Context<C>>(ctx: T): GateModel => {
  const model: GateModel = {
    getClient: async user => {
      const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)
      try {
        return await oidc.getClient({
          entityId: user.entityId,
          clientId: oidc.entityToClientId({ entityId: user.entityId })
        })
      } catch (e) {
        if (e instanceof AuthManagerError) {
          const [providers] = await ctx.module<ClientModule<OidcProviderDescriptor[]>>(
            authService.provider.list
          ).call({
            params: { service: ctx.cfg.alias ?? ctx.cfg.service },
            query: { entityId: user.entityId }
          })
          if (providers.length < 1) {
            throw new AuthUnknown()
          }
          oidc.registerTemporaryProvider(providers[0])

          return model.getClient(user)
        }
        throw e
      }
    },

    loadPermissions: async (user, permissions) => {
      console.log('\n\n PERMISSIONS REQUEST: ', permissions)
      const record = await cache<C, T>(ctx).get(managedId(user.token))
      if (record.payload == null) {
        throw new AuthForbidden('record')
      }

      const client = await model.getClient(user)

      const metadata = client.getMetadata()
      const tokenEndpoint = metadata.token_endpoint

      if (tokenEndpoint == null) {
        throw new AuthManagerUnsupported('token-url')
      }

      const request = await model.makeRequest(
        model.fixPermissions(permissions, user),
        client
      )

      console.log('-----------')

      request.subject_token = record.payload.access_token

      const response = await fetch(
        tokenEndpoint,
        await model.prepareRequest(client, request)
      )

      console.log(response)

      if (!response.ok) {
        console.log(await response.text())
        return []
      }

      const proofs = await response.json() as PermissionResponse[]

      console.log('Proofs and permissions we got', permissions, proofs)

      return permissions.filter(permission => {
        const [fixed] = model.fixPermissions([permission], user)
        const [resource, scope] = fixed.split(':')
        const proof = proofs.find(p => p.rsid === resource || p.rsname === resource)
        return proof != null
          && (scope == null || (proof.scopes?.includes(scope) ?? false))
      })
    },

    fixPermissions: (permissions, user) => permissions.map(
      perm => perm.replaceAll('{entity}', user.entityId ?? '-')
    ),

    prepareRequest: async (client, request) => {
      console.log('>>>> ', request)
      let { permission, ..._request } = request
      const params = new URLSearchParams(_request)
      permission = Array.isArray(permission) ? permission : [permission]
      permission.forEach(perm => params.append('permission', perm))
      const body = params.toString()

      const cfg = client.getConfig()

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${client.getClientId()}:${cfg.secret}`).toString('base64')}`,
        'Content-Length': `${body.length}`,
      }

      console.log({ body, headers, method: 'POST' })

      return { body, headers, method: 'POST' }
    },

    makeRequest: async (permissions, client) => {
      const cfg = client.getConfig()
      const clientId = client.getClientId()
      const permission = {
        grant_type: 'urn:ietf:params:oauth:grant-type:uma-ticket',
        audience: clientId,
        client_id: clientId,
        secret: cfg.secret,
        permission: permissions.reduce((output, permission) => {
          const [resource, scope] = permission.split(':')
          const idx = output.findIndex(perm => perm.startsWith(resource))
          if (idx > -1) {
            output[idx] += `, ${scope}`
          } else {
            output.push(`${resource}${scope ? `#${scope}` : ''}`)
          }
          return output
        }, [] as string[]),
        response_mode: ResponseMode.Permissions,
      } satisfies PermissionRequest

      return permission
    }
  }

  return model
}
