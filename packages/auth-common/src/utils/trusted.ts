
import type { Context } from './types.js'
import type { TrustedRecord } from '../types.js'
import type { Resource } from '@owlmeans/resource'
import { fromPubKey, makeKeyPairModel } from '@owlmeans/basic-keys'

export const trust = async (context: Context, resource: string, userName: string, field: string = 'name') => {
  const trustedUser = await context.resource<Resource<TrustedRecord>>(resource).load(userName, field)
  if (trustedUser == null) {
    throw new SyntaxError(`Auth service trusted entity is not provided: ${userName}`)
  }

  // @TODO credential can really be undefined - we need to process it properly
  const keyPair = trustedUser.secret != null ? makeKeyPairModel(trustedUser.secret) : fromPubKey(trustedUser.credential!)

  return { user: trustedUser, key: keyPair }
}
