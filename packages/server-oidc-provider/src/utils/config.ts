import type { Context, OidcCustomConfiguration } from '../types.js'
import { makeUriUpdater, updateClient } from './client.js'
import { ORGANIZATIONS_CLAIM, ORGANIZATIONS_SCOPE, PERMISSIONS_CLAIM, PERMISSIONS_SCOPE } from '@owlmeans/oidc'
import { makeSecurityHelper } from '@owlmeans/config'
import * as jose from 'jose'

export const combineConfig = async (context: Context, _unsecure: boolean): Promise<OidcCustomConfiguration> => {
  const cfg = context.cfg.oidc
  const updateUri = makeUriUpdater(context, makeSecurityHelper(context))

  const configuration: OidcCustomConfiguration = {
    ...cfg.customConfiguration,
    clients: [
      ...cfg.clients,
      ...(cfg.customConfiguration?.clients ?? [])
    ].map(client => updateClient(context, client)),
    claims: {
      email: ['email', 'email_verified', ...cfg.customConfiguration?.claims?.email ?? []],
      profile: [
        'username', 'family_name', 'given_name', 'locale', 'name', 'nickname', 'preferred_username',
        ...cfg.customConfiguration?.claims?.profile ?? []
      ],
      // Inert unless the account service actually emits the claim (integrated IAM mode)
      [PERMISSIONS_SCOPE]: [PERMISSIONS_CLAIM],
      // Inert likewise — and a static scope, so only a client whose allowlist names it may ask
      [ORGANIZATIONS_SCOPE]: [ORGANIZATIONS_CLAIM],
      ...cfg.customConfiguration?.claims,
    },
    scopes: [
      'openid', 'profile', 'offline_access', PERMISSIONS_SCOPE, ORGANIZATIONS_SCOPE,
      ...cfg.customConfiguration?.scopes ?? []
    ],
    discovery: {
      ...cfg.customConfiguration?.discovery,
      ...Object.fromEntries(Object.entries(cfg.discoveryUris ?? {}).map(([field, uri]) => [field, updateUri(uri)])),
    },
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
    },
    jwks: {
      keys: [
        await jose.exportJWK(await jose.importPKCS8(cfg.defaultKeys.RS256.pk, 'RS256', { extractable: true }))
      ]
    }
  }

  return configuration
}
