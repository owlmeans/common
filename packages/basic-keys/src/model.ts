import type { KeyPairModel, KeyPairModelMaker } from './types.js'
import { plugins } from './plugins/index.js'
import { base64 } from '@scure/base'
import { assertType, prepareData, prepareKey } from './utils.js'
import { inputToKeyPair } from './keypair.js'

export const makeKeyPairModel: KeyPairModelMaker = input => {
  const keyPair = inputToKeyPair(input)

  const _model: KeyPairModel = {
    keyPair,

    sign: async (data) => {
      data = prepareData(data)
      assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return base64.encode(
        plugins[_model.keyPair.type].sign(
          prepareKey(_model.keyPair.privateKey),
          data as Uint8Array
        )
      )
    },
    
    verify: async (data, signature) => {
      data = prepareData(data)
      assertType(_model.keyPair?.type)
      const sig = base64.decode(signature)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return plugins[_model.keyPair.type].verify(
        data as Uint8Array,
        sig,
        prepareKey(_model.keyPair.publicKey)
      )
    },

    export: pub => {
      pub = pub ?? false
      assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      if (pub) {
        return `${_model.keyPair.type}:${_model.keyPair.publicKey}`  
      }
      return `${_model.keyPair.type}:${_model.keyPair.privateKey}`
    }
  }

  return _model
}
