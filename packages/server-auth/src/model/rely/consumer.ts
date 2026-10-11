import { makeRelyModel } from './peer.js'
import type { RelyToken } from '@owlmeans/auth'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'
import type { RelyOptions } from './types.js'

export const makeConsumerRely = (opts?: RelyOptions): EnvelopeModel<RelyToken> => {
  const model = makeRelyModel(opts)
  const msg = model.message()
  delete msg.pin
  model.send(msg)

  return model
}
