import { randomBytes } from '@noble/hashes/utils'
import { hex } from '@scure/base'
import type { ClientMetadata } from 'oidc-provider'
import type { Context } from '../types.js'

export const updateClient = (context: Context, client: ClientMetadata): ClientMetadata => {
  if (client.client_secret == null) {
    if (!context.cfg.debug.all && !context.cfg.debug.oidc) {
      throw new SyntaxError('Client secret is required')
    }
    client.client_secret = hex.encode(randomBytes(32))

    console.log('\n')
    console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
    console.log('IT IS EXCEPTIONALY UNSECURE, BUT WE GENEREATED A CLIENT SECRET FOR YOU', client.client_secret)
    console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
    console.log('\n')
  }

  return client
}
