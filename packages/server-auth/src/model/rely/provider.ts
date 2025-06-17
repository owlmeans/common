
import { makeRelyModel } from './peer.js'
import type { RelyOptions } from './types.js'

export const makeProviderRely = (opts?: RelyOptions) => {
  const model = makeRelyModel(opts)

  return model
}
