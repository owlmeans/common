
import type { Context, Config } from './types.js'
import type { TrustedRecord } from '../types.js'
import type { Criteria, Resource } from '@owlmeans/resource'
import { fromPubKey, makeKeyPairModel } from '@owlmeans/basic-keys'

export const trust = async <C extends Config, T extends Context<C>>(context: T, resource: string, userName: string, field: string = 'name') => {
  const where: Criteria<TrustedRecord> = { [field]: userName }
  const trustedUser = await context.resource<Resource<TrustedRecord>>(resource).load(where)
  if (trustedUser == null) {
    throw new SyntaxError(`Auth service trusted entity is not provided: ${userName}`)
  }

  // @TODO credential can really be undefined - we need to process it properly
  const keyPair = trustedUser.secret != null ? makeKeyPairModel(trustedUser.secret) : fromPubKey(trustedUser.credential!)

  return { user: trustedUser, key: keyPair }
}
