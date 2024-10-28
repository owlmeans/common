import type { RelyToken } from '@owlmeans/auth'
import { RELY_3RD } from '@owlmeans/auth'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'
import { makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { createRandomPrefix, createIdOfLength, IdStyle } from '@owlmeans/basic-ids'
import { base58 } from '@scure/base'
import type { RelyOptions } from './types.js'
import { RELY_CALL_TIMEOUT } from '@owlmeans/auth-common'

export const makeRelyModel = (opts?: RelyOptions): EnvelopeModel<RelyToken> => {
  const envelope = makeEnvelopeModel<RelyToken>(RELY_3RD)

  const startTime = Date.now()
  
  const pinLength = opts?.pinLength ?? 6
  const checkLength = opts?.checkLenght ?? 2
  const tokenLength = opts?.tokenLength ?? 16
  const nonceLength = opts?.nonceLength ?? 24
  const pinQty = Math.ceil(pinLength / 2)
  const checkQty = Math.ceil(checkLength / 2)
  const tokenQty = tokenLength
  const source = createRandomPrefix(pinQty + checkQty + tokenQty)
  const bytes = base58.decode(source)
  const pinBytes = bytes.slice(0, pinQty)
  const checkBytes = bytes.slice(pinQty, pinQty + checkQty)
  const tokenBytes = bytes.slice(pinQty + checkQty)

  const pin = toNumber(pinBytes).substring(0, pinLength)
  envelope.send({
    pin,
    check: toNumber(checkBytes).substring(0, checkLength),
    token: base58.encode(tokenBytes).substring(0, tokenLength),
    nonce: createIdOfLength(nonceLength, IdStyle.Base64)
  }, opts?.liveTime ?? RELY_CALL_TIMEOUT * 1000)

  console.log('Rely generetatd within: ', (Date.now() - startTime) / 1000, 's')

  return envelope
}

const toNumber = (bytes: Uint8Array): string => {
  let pinInt = 0n
  for (let i = bytes.length - 1; i >= 0; i--) {
    pinInt = (pinInt << 8n) | BigInt(bytes[i]);
  }
  return pinInt.toString()
}
