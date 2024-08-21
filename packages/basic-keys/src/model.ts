import type { KeyPairModel, KeyPairModelMaker } from './types.js'
import { plugins } from './plugins/index.js'
import { base64, base64urlnopad } from '@scure/base'
import { assertType, prepareData, prepareKey } from './utils.js'
import { inputToKeyPair } from './keypair.js'

export const makeKeyPairModel: KeyPairModelMaker = input => {
  const keyPair = inputToKeyPair(input)

  const _model: KeyPairModel = {
    keyPair,

    sign: async (data) => {
      data = prepareData(data)
      console.log('SIGN: ', base64.encode(data as Uint8Array))
      console.log('SIGN WITH:', _model.exportAddress(), _model.exportPublic())
      assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      if (_model.keyPair.privateKey == null) {
        throw new Error('basic.keys:missing-pk')
      }

      return base64urlnopad.encode(
        plugins[_model.keyPair.type].sign(
          data as Uint8Array,
          prepareKey(_model.keyPair.privateKey)
        )
      )
    },
    
    verify: async (data, signature) => {
      data = prepareData(data)
      console.log('VERIFY: ', base64.encode(data as Uint8Array))
      assertType(_model.keyPair?.type)
      const sig = base64urlnopad.decode(signature)

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
