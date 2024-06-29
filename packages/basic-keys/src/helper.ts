import { KeyType } from './consts.js'
import { makeKeyPairModel } from './model.js'
import type { KeyPair, KeyPairModel } from './types.js'
import { createAddress, prepareKey } from './utils.js'

export const fromPubKey = (pubKey: string, type?: string): KeyPairModel => {
  if (type == null) {
    [type, pubKey] = pubKey.split(':', 2)
    if (pubKey == null) {
      pubKey = type
      type = KeyType.ED25519
    }
  }
  const keyPair: KeyPair = {
    privateKey: '', 
    publicKey: pubKey, 
    type,
    address: createAddress(prepareKey(pubKey))
  }

  return makeKeyPairModel(keyPair)
}

export const matchAddress = (address: string, pubKey: string): boolean =>
  address === createAddress(prepareKey(pubKey))
