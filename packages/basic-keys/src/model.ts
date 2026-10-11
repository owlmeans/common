import type { KeyPair, KeyPairModel } from './types.js'
import { plugins } from './plugins/index.js'
import { base64urlnopad, utf8 } from '@scure/base'
import { keyUtils } from './utils.js'
import { inputToKeyPair } from './keypair.js'

export const makeKeyPairModel = (input?: KeyPair | string): KeyPairModel => {
  const keyPair = inputToKeyPair(input)

  const _model: KeyPairModel = {
    keyPair,

    sign: async (data) => {
      data = keyUtils.prepareData(data)
      keyUtils.assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      if (_model.keyPair.privateKey == null) {
        throw new Error('basic.keys:missing-pk')
      }

      return base64urlnopad.encode(
        plugins[_model.keyPair.type].sign(
          data as Uint8Array,
          keyUtils.prepareKey(_model.keyPair.privateKey)
        )
      )
    },
    
    verify: async (data, signature) => {
      data = keyUtils.prepareData(data)
      keyUtils.assertType(_model.keyPair?.type)
      const sig = base64urlnopad.decode(signature)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return plugins[_model.keyPair.type].verify(
        data as Uint8Array,
        sig,
        keyUtils.prepareKey(_model.keyPair.publicKey)
      )
    },

    export: () => {
      keyUtils.assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return `${_model.keyPair.type}:${_model.keyPair.privateKey}`
    },

    exportPublic: () => {
      keyUtils.assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return `${_model.keyPair.type}:${_model.keyPair.publicKey}`  
    },

    exportAddress: () => {
      keyUtils.assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return `${_model.keyPair.type}:${_model.keyPair.address}`
    },

    encrypt: async data => {
      data = keyUtils.prepareData(data)
      keyUtils.assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return base64urlnopad.encode(
        plugins[_model.keyPair.type].encrypt(
          data as Uint8Array,
          keyUtils.prepareKey(_model.keyPair.publicKey)
        )
      )
    },

    decrypt: async data => {
      const plain = await _model.dcrpt(data)
      try {
        // @scure/base v2 decodes utf8 with { fatal: true } — a wrong key or a
        // binary payload throws here instead of yielding replacement characters.
        return utf8.encode(plain)
      } catch {
        throw new Error('basic.keys:decrypt-not-utf8')
      }
    },

    dcrpt: async data => {
      data = data instanceof Uint8Array ? data : base64urlnopad.decode(data as string)
      keyUtils.assertType(_model.keyPair?.type)

      if (_model.keyPair == null) {
        throw new Error('basic.keys:missing-keypair')
      }

      return plugins[_model.keyPair.type].decrypt(
        data as Uint8Array,
        keyUtils.prepareKey(_model.keyPair.privateKey)
      )
    }
  }

  return _model
}
