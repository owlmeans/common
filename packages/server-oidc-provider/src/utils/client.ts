import { randomBytes } from '@noble/hashes/utils'
import { hex } from '@scure/base'
import type { ClientMetadata } from 'oidc-provider'
import type { Config, Context } from '../types.js'
import { makeSecurityHelper } from '@owlmeans/config'
import type { SecurityHelper } from '@owlmeans/config'
import { SEP } from '@owlmeans/route'

export const updateClient = (context: Context, client: ClientMetadata): ClientMetadata => {
  if (client.client_secret == null) {
    if (!context.cfg.debug.all && !context.cfg.debug.oidc) {
      throw new SyntaxError('Client secret is required')
    }
    client.client_secret = hex.encode(randomBytes(32))

    console.info('\n')
    console.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
    console.warn('IT IS EXCEPTIONALY UNSECURE, BUT WE GENEREATED A CLIENT SECRET FOR YOU', client.client_secret)
    console.info('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
    console.info('\n')
  }

  const helper = makeSecurityHelper<Config, Context>(context)
  const updateUri = makeUriUpdater(context, helper)
  client.redirect_uris = client.redirect_uris?.map(updateUri) ?? []
  client.post_logout_redirect_uris = client.post_logout_redirect_uris?.map(updateUri) ?? []
  
  return client
}

const makeUriUpdater = (context: Context, helper: SecurityHelper) => (uri: string): string => {
  if (uri.startsWith('{{')) {
    const [host, ...parts] = uri.split(SEP)
    
    const service = context.cfg.services[host.slice(2, -2)]
    return helper.makeUrl(service, parts.join(SEP))
  }

  return uri
}