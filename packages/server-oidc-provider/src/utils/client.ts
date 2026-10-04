import { randomBytes } from '@noble/hashes/utils'
import { hex } from '@scure/base'
import type { ClientMetadata } from 'oidc-provider'
import type { Config, Context } from '../types.js'
import { makeSecurityHelper } from '@owlmeans/config'
import type { SecurityHelper } from '@owlmeans/config'
import { SEP } from '@owlmeans/route'
import { logger } from '@owlmeans/log'

const log = logger('server-oidc-provider')

export const updateClient = (context: Context, client: ClientMetadata): ClientMetadata => {
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
  const updateUri = makeUriUpdater(context, helper)
  client.redirect_uris = client.redirect_uris?.map(updateUri) ?? []
  client.post_logout_redirect_uris = client.post_logout_redirect_uris?.map(updateUri) ?? []
  
  return client
}

/** Expands a `{{service-alias}}/path` URI against that registered service; any other URI is kept. */
export const makeUriUpdater = (context: Context, helper: SecurityHelper) => (uri: string): string => {
  if (uri.startsWith('{{')) {
    const [host, ...parts] = uri.split(SEP)
    
    const service = context.cfg.services[host.slice(2, -2)]
    return helper.makeUrl(service, parts.join(SEP))
  }

  return uri
}