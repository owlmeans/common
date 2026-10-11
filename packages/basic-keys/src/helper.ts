import { KeyType } from './consts.js'
import { makeKeyPairModel } from './model.js'
import { plugins } from './plugins/index.js'
import type { KeyPair, KeyPairModel } from './types.js'
import { keyUtils } from './utils.js'
import type { KeyHelper } from './helper/types.js'

export const createKeyHelper = (): KeyHelper => {
  const fromPubKey = (pubKey: string, type?: string): KeyPairModel => {
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
      address: plugins[type].toAdress(keyUtils.prepareKey(pubKey))
    }

    return makeKeyPairModel(keyPair)
  }

  const matchAddress = (address: string, pubKey: string): boolean =>
    address === fromPubKey(pubKey).exportAddress()

  return { fromPubKey, matchAddress }
}

export const keyHelper = createKeyHelper()

/** @deprecated compat:factory-refactor — use `keyHelper.fromPubKey(…)` */
export const fromPubKey = (pubKey: string, type?: string): KeyPairModel => keyHelper.fromPubKey(pubKey, type)
