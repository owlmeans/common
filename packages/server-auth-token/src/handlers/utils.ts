import { AUTH_TOKEN_RESOURCE, type AccessTokenRecord, type AccessTokenView } from '@owlmeans/auth-token'
import type { AccessTokenResource, AuthTokenContext } from '../types.js'
import type { TokenRecordUtils } from './utils/types.js'

export const createTokenRecordUtils = (): TokenRecordUtils => {
  const view = (record: AccessTokenRecord): AccessTokenView => {
    const { hash, ...rest } = record

    return rest
  }

  const tokens = (ctx: AuthTokenContext): AccessTokenResource =>
    ctx.resource<AccessTokenResource>(AUTH_TOKEN_RESOURCE)

  return { view, tokens }
}

export const tokenRecordUtils = createTokenRecordUtils()
