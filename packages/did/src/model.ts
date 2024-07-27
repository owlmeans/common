import { makeKeyPairModel, plugins, type KeyPair } from '@owlmeans/basic-keys'
import type { DIDKeyModel } from './types.js'
import { DIDKeyError } from './errors.js'
import { assertType, prepareKey } from '@owlmeans/basic-keys/utils'
import { base64 } from '@scure/base'
import { KP_SEP, MAX_DEPTH } from './consts.js'

export const makeDidKeyModel: (input?: KeyPair | string) => DIDKeyModel = input => {
  if (typeof input == 'string') {
    const plugin = plugins[input]
    if (plugin != null && (plugin.fromSeed == null || plugin.derive == null)) {
      throw new DIDKeyError(`non-derivable:${input}`)
    }
  }
  const model: DIDKeyModel = makeKeyPairModel(input) as DIDKeyModel

  model.derive = path => {
    if (model.keyPair == null) {
      throw new DIDKeyError('no:keypair')
    }
    assertType(model.keyPair?.type)
    if (model.keyPair.privateKey == null) {
      throw new DIDKeyError('no:pk')
    }

    const items = path.split(KP_SEP).filter(item => item != null && item !== '')

    if (items.length > MAX_DEPTH) {
      throw new DIDKeyError('too:deep')
    }
    
    const item = items.shift()
    if (item == null) {
      throw new DIDKeyError('no:path')
    }

    const newKey = [model.keyPair.type, base64.encode(
      plugins[model.keyPair.type].derive!(prepareKey(model.keyPair.privateKey), item)
    )].join(':')
    
    const derived = makeDidKeyModel(newKey)
    if (derived.keyPair == null) {
      throw new DIDKeyError('derived:missgenerated')
    }
    derived.keyPair.path = path
    derived.keyPair.parent = model.exportAddress()

    return items.length > 0 ? derived.derive(items.join(KP_SEP)) : derived
  }

  return model
}
