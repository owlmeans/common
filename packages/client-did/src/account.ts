import type{ DIDKeyModel } from '@owlmeans/did'
import { makeDidKeyModel } from '@owlmeans/did'
import type { DIDAccountModel } from './types.js'
import { fromPubKey, KeyPair } from '@owlmeans/basic-keys'

export const makeDidAccountModel = (did: KeyPair| DIDKeyModel | string, isPub: boolean = false): DIDAccountModel => {
  if (typeof did === 'string') {
    if (isPub) {
      did = makeDidKeyModel(fromPubKey(did).keyPair)
    } else {
      did = makeDidKeyModel(did)
    }
  } else if (!("keyPair" in did)) {
    did = makeDidKeyModel(did as KeyPair)
  }
  const model: DIDAccountModel = {
    did,

    authenticate: async auth => {
      auth.userId = model.did.exportAddress()
      auth.publicKey = model.did.exportPublic()
      auth.credential = await model.did.sign(auth.challenge)

      return auth
    }
  }

  return model
}
