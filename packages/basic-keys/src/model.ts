import type { KeyPairModel, KeyPairModelMaker } from './types.js'
import { plugins } from './plugins/index.js'
import { base64urlnopad, utf8 } from '@scure/base'
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
    },

    encrypt: async data => {
      data = prepareData(data)
      assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return base64urlnopad.encode(
        plugins[_model.keyPair.type].encrypt(
          data as Uint8Array,
          prepareKey(_model.keyPair.publicKey)
        )
      )
    },

    decrypt: async data => utf8.encode(await _model.dcrpt(data)),

    dcrpt: async data => {
      data = data instanceof Uint8Array ? data : base64urlnopad.decode(data as string)
      assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return plugins[_model.keyPair.type].decrypt(
        data as Uint8Array,
        prepareKey(_model.keyPair.privateKey)
      )
    }
  }

  return _model
}
