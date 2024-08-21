import type { KeyPairModel } from '@owlmeans/basic-keys'
import type { AppContext } from '../types.js'
import { TRUSTED } from '@owlmeans/server-context'
import { AUTH_SRV_KEY } from '../../consts.js'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import type { TrustedRecord } from '@owlmeans/auth-common'

export const trusted = async (context: AppContext, userName: string = AUTH_SRV_KEY): Promise<[TrustedRecord, KeyPairModel]> => {

  const trustedUser = await context.getConfigResource(TRUSTED).load<TrustedRecord>(userName, "name")
  if (trustedUser == null || trustedUser.secret == null) {
    throw new SyntaxError(`Auth service trusted entity secret not provided: ${userName}`)
  }

  const keyPair = makeKeyPairModel(trustedUser.secret)

  return [trustedUser, keyPair]
}
