import { randomBytes } from '@noble/hashes/utils.js'
import { hex } from '@scure/base'
import type { ClientMetadata } from 'oidc-provider'
import type { Config, Context, OidcCustomConfiguration } from '../types.js'
import { ORGANIZATIONS_CLAIM, ORGANIZATIONS_SCOPE, PERMISSIONS_CLAIM, PERMISSIONS_SCOPE } from '@owlmeans/oidc'
import { makeSecurityHelper } from '@owlmeans/config'
import type { SecurityHelper } from '@owlmeans/config'
import { memoHelper } from '@owlmeans/context'
import { SEP } from '@owlmeans/route'
import { logger } from '@owlmeans/log'
import * as jose from 'jose'
import type { OidcConfigUtils } from './config/types.js'

const log = logger('server-oidc-provider')

/** A claim list is an array, or (as the provider's types also allow) a record keyed by claim name. */
const claimNamesOf = (claims: readonly string[] | Readonly<Record<string, null>> | null | undefined): readonly string[] =>
  claims == null ? [] : Array.isArray(claims) ? claims : Object.keys(claims)

export const makeOidcConfigUtils = (context: Context): OidcConfigUtils => {
  /** Expands a `{{service-alias}}/path` URI against that registered service; any other URI is kept. */
  const uriUpdater = (helper: SecurityHelper): ((uri: string) => string) => (uri: string): string => {
    if (uri.startsWith('{{')) {
      const [host, ...parts] = uri.split(SEP)

      const service = context.cfg.services[host.slice(2, -2)]
      return helper.makeUrl(service, parts.join(SEP))
    }

    return uri
  }

  const updateClient = (client: ClientMetadata): ClientMetadata => {
    if (client.client_secret == null) {
      if (!context.cfg.debug.all && !context.cfg.debug.oidc) {
        throw new SyntaxError('Client secret is required')
      }
      client.client_secret = hex.encode(randomBytes(32))
      // The secret itself is never written to a log.
      log.warn('Exceptionally insecure: a client secret was generated for an OIDC client (debug only)', {
        clientId: client.client_id,
      })
    }

    const helper = makeSecurityHelper<Config, Context>(context)
    const updateUri = uriUpdater(helper)
    client.redirect_uris = client.redirect_uris?.map(updateUri) ?? []
    client.post_logout_redirect_uris = client.post_logout_redirect_uris?.map(updateUri) ?? []

    return client
  }

  const combineConfig = async (_unsecure: boolean): Promise<OidcCustomConfiguration> => {
    const cfg = context.cfg.oidc
    const updateUri = uriUpdater(makeSecurityHelper(context))

    const configuration: OidcCustomConfiguration = {
      ...cfg.customConfiguration,
      clients: [
        ...cfg.clients,
        ...(cfg.customConfiguration?.clients ?? [])
      ].map(client => updateClient(client)),
      claims: {
        email: ['email', 'email_verified', ...claimNamesOf(cfg.customConfiguration?.claims?.email)],
        profile: [
          'username', 'family_name', 'given_name', 'locale', 'name', 'nickname', 'preferred_username',
          ...claimNamesOf(cfg.customConfiguration?.claims?.profile)
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

  return { combineConfig }
}

/** The configuration utils of a context — one per context. */
export const oidcConfigOf = memoHelper.oncePer(makeOidcConfigUtils)
