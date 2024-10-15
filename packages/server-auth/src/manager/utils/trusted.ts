import type { KeyPairModel } from '@owlmeans/basic-keys'
import type { AppContext, AppConfig } from '../types.js'
import { TRUSTED } from '@owlmeans/config'
import { AUTH_SRV_KEY } from '../../consts.js'
import type { TrustedRecord } from '@owlmeans/auth-common'
import { trust } from '@owlmeans/auth-common/utils'

export const trusted = async (context: AppContext, userName: string = AUTH_SRV_KEY): Promise<[TrustedRecord, KeyPairModel]> => {
  const trusted = await trust<AppConfig, AppContext>(context, TRUSTED, userName)

  if (trusted.user.secret == null) {
    throw new SyntaxError(`Auth srvice trusted users should have secret keys to be used ${userName}`)
  }

  return [trusted.user, trusted.key]
}
