import { AuthForbidden, AuthManagerError, AuthManagerUnsupported, AuthorizationError, AuthUnknown, authHelper } from '@owlmeans/auth'
import { authService, DEFAULT_ALIAS } from '../consts.js'
import type { Config, Context, OidcClientService } from '../types.js'
import { oidcCacheOf } from '../utils/cache.js'
import type { GateModel, PermissionRequest, PermissionResponse } from './types.js'
import { ResponseMode } from './consts.js'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { OidcProviderDescriptor } from '@owlmeans/oidc'
import { logger } from '@owlmeans/log'

const log = logger('server-oidc-rp')

export const createGateModel = <C extends Config, T extends Context<C>>(ctx: T): GateModel => {
  const model: GateModel = {
    getClient: async user => {
      const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)
      try {
        return await oidc.getClient({
          entityId: authHelper.entitySlugOf(user),
          clientId: oidc.entityToClientId({ entityId: authHelper.entitySlugOf(user) })
        })
      } catch (e) {
        if (e instanceof AuthManagerError) {
          const providers = await ctx.entrypoint<ClientEntrypoint<OidcProviderDescriptor[]>>(
            authService.provider.list
          ).call({
            params: { service: ctx.cfg.alias ?? ctx.cfg.service },
            query: { entityId: authHelper.entitySlugOf(user) }
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
      const oidcCache = oidcCacheOf(ctx)
      const record = await oidcCache.resource().load(oidcCache.managedId(user.token))
      if (record == null) {
        // The session's record is gone (signed out, expired, evicted): the caller signs in again.
        // A bare `get` would surface the storage refusal instead and answer "not found".
        throw new AuthorizationError('record')
      }
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

      request.subject_token = record.payload.access_token

      const response = await fetch(
        tokenEndpoint,
        await model.prepareRequest(client, request)
      )

      if (!response.ok) {
        if (response.status === 400) {
          throw new AuthUnknown('invalid')
        }

        // Never the response body: it is the token endpoint's answer to this user's request.
        log.warn('Permission request failed at the token endpoint', { status: response.status })
        return []
      }

      const proofs = await response.json() as PermissionResponse[]

      return permissions.filter(permission => {
        const [fixed] = model.fixPermissions([permission], user)
        const [resource, scope] = fixed.split(':')
        const proof = proofs.find(p => p.rsid === resource || p.rsname === resource)
        return proof != null
          && (scope == null || (proof.scopes?.includes(scope) ?? false))
      })
    },

    fixPermissions: (permissions, user) => permissions.map(
      perm => perm.replaceAll('{entity}', authHelper.entitySlugOf(user) ?? '-')
    ),

    prepareRequest: async (client, request) => {
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
