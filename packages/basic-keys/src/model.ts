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
          data as Uint8Array,
          prepareKey(_model.keyPair.privateKey)
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

    export: () => {
      assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return `${_model.keyPair.type}:${_model.keyPair.privateKey}`
    },

    exportPublic: () => {
      assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return `${_model.keyPair.type}:${_model.keyPair.publicKey}`  
    },

    exportAddress: () => {
      assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return `${_model.keyPair.type}:${_model.keyPair.address}`
    }
  }

  return _model
}
