import type { Context } from '../types.js'
import type { Configuration } from 'oidc-provider'
import { updateClient } from './client.js'

export const combineConfig = (context: Context, _unsecure: boolean): Configuration => {
  const cfg = context.cfg.oidc
  const configuration: Configuration = {
    ...cfg.customConfiguration,
    clients: [
      ...cfg.staticClients,
      ...(cfg.customConfiguration?.clients ?? [])
    ].map(client => updateClient(context, client)),
    claims: {
      email: ['email', 'email_verified', ...cfg.customConfiguration?.claims?.email ?? []],
      profile: [
        'username', 'family_name', 'given_name', 'locale', 'name', 'nickname', 'preferred_username',
        ...cfg.customConfiguration?.claims?.profile ?? []
      ],
      ...cfg.customConfiguration?.claims,
    },
    scopes: ['openid', 'profile', 'username', 'profile.username'],
    features: {
      ...cfg.customConfiguration?.features,
      devInteractions: { enabled: false }
      // devInteractions: {
      //   enabled: (
      //     (context.cfg.debug.all && context.cfg.debug.oidc !== false)
      //     || context.cfg.debug.oidc
      //   ) && unsecure,
      //   ...cfg.customConfiguration?.features?.devInteractions,
      // },
    }
  }

  return configuration
}
