import type { KeyPairModel } from '@owlmeans/basic-keys'
import type { AppContext, AppConfig } from '../types.js'
import { TRUSTED } from '@owlmeans/config'
import type { TrustedRecord } from '@owlmeans/auth-common'
import { trust } from '@owlmeans/auth-common/utils'
import { authSettingsOf } from '../../settings.js'

/**
 * The auth manager's own signing record — `cfg.auth.authKey`, else `AUTH_SRV_KEY` — or another
 * record named explicitly. It must carry a secret key: the manager signs with it.
 */
export const trusted = async (
  context: AppContext, userName: string = authSettingsOf(context).authKey()
): Promise<[TrustedRecord, KeyPairModel]> => {
  const trusted = await trust<AppConfig, AppContext>(context, TRUSTED, userName)

  if (trusted.user.secret == null) {
    throw new SyntaxError(`Auth srvice trusted users should have secret keys to be used ${userName}`)
  }

  return [trusted.user, trusted.key]
}
