
import { makeRelyModel } from './peer.js'
import type { RelyToken } from '@owlmeans/auth'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'
import type { RelyOptions } from './types.js'

export const makeProviderRely = (opts?: RelyOptions): EnvelopeModel<RelyToken> => {
  const model = makeRelyModel(opts)

  return model
}
