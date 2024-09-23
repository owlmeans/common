import { makeRelyModel } from './peer'
import type { RelyOptions } from './types.js'

export const makeConsumerRely = (opts?: RelyOptions) => {
  const model = makeRelyModel(opts)
  const msg = model.message()
  delete msg.pin
  model.send(msg)

  return model
}
