import type { TrustedRecord } from '@owlmeans/server-context'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import type { AppContext } from '../types.js'
import { TRUSTED } from '@owlmeans/server-context'
import { AUTH_SRV_KEY } from '../../consts.js'
import { makeKeyPairModel } from '@owlmeans/basic-keys'

let _trustedUser: TrustedRecord | null = null
let _keyPair: KeyPairModel | null = null

export const trusted = async (context: AppContext): Promise<[TrustedRecord, KeyPairModel]> => {
  if (_trustedUser == null) {

    const trustedUser = await context.getConfigResource(TRUSTED).load<TrustedRecord>(AUTH_SRV_KEY, "name")
    if (trustedUser == null || trustedUser.secret == null) {
      throw new SyntaxError(`Auth service trusted entity secret not provided: ${AUTH_SRV_KEY}`)
    }

    _trustedUser = trustedUser
    _keyPair = makeKeyPairModel(trustedUser.secret)
  }

  return [_trustedUser, _keyPair!]
}
