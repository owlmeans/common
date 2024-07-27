import { KeyType } from './consts.js'
import { makeKeyPairModel } from './model.js'
import { plugins } from './plugins/index.js'
import type { KeyPair, KeyPairModel } from './types.js'
import { prepareKey } from './utils.js'

export const fromPubKey = (pubKey: string, type?: string): KeyPairModel => {
  if (type == null) {
    [type, pubKey] = pubKey.includes(':') ? pubKey.split(':', 2) : [KeyType.ED25519, pubKey]
    if (pubKey == null) {
      pubKey = type
      type = KeyType.ED25519
    }
  }

  const keyPair: KeyPair = {
    privateKey: '',
    publicKey: pubKey,
    type,
    address: plugins[type].toAdress(prepareKey(pubKey))
  }

  return makeKeyPairModel(keyPair)
}

export const matchAddress = (address: string, pubKey: string): boolean =>
  address === fromPubKey(pubKey).exportAddress()
