
import { assertType } from '@owlmeans/basic-keys/utils'
import { KEY_OWL } from '../consts.js'
import { base64 } from '@scure/base'
import { plugins } from '../plugins/index.js'
import { DIDKeyError } from '../errors.js'
import type { DIDKeyPair } from '../types.js'

export const produceKey = (seed: string | Uint8Array, type: string = KEY_OWL) => {
  if (typeof seed === 'string') {
    seed = base64.decode(seed)
  }
  assertType(type)

  if (plugins[type].fromSeed == null) {
    throw new DIDKeyError(`non-derivable:${type}`)
  }

  const privateKey = plugins[type].fromSeed(seed)
  const publicKey = plugins[type].toPublic(privateKey)
  const keyPair: DIDKeyPair = {
    privateKey: base64.encode(privateKey),
    publicKey: base64.encode(publicKey),
    address: plugins[type].toAdress(publicKey),
    type,
  }

  return keyPair
}
