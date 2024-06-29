import type { KeyPair } from './types.js'
import { base64 } from '@scure/base'
import { KeyType } from './consts.js'
import { plugins } from './plugins/index.js'
import { assertType, createAddress } from './utils.js'

export const inputToKeyPair = (input?: KeyPair | string): KeyPair => {
  let type: string = KeyType.ED25519
  let keyPair: KeyPair | null = null
  let primaryKey: Uint8Array | null = null
  if (typeof input === 'object') {
    keyPair = input
  } else if (typeof input === 'string') {
    if (input in plugins) { // TODO: plugins need to be checked also
      type = input
    } else {
      const [keyType, key] = input.split(':', 2)
      if (key == null && keyType != null) {
        type = KeyType.ED25519
        primaryKey = base64.decode(keyType)
      } else if (key != null) {
        type = keyType
        primaryKey = base64.decode(key)
      } else {
        throw new Error('basic.keys:string-type-or-key')
      }
    }
  }
  if (keyPair == null) {
    assertType(type)
    if (primaryKey == null) {
      primaryKey = plugins[type].random()
    }
    const publicKey = plugins[type].toPublic(primaryKey)
    keyPair = {
      privateKey: base64.encode(primaryKey),
      publicKey: base64.encode(publicKey),
      address: createAddress(publicKey),
      type,
    }
  }

  return keyPair
}
