import type { RelyChallenge } from '@owlmeans/auth'
import { RELY_3RD } from '@owlmeans/auth'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'
import { makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { createRandomPrefix, createIdOfLength, IdStyle } from '@owlmeans/basic-ids'
import { base58, base32nopad } from '@scure/base'
import type { RelyOptions } from './types.js'
import { RELY_TIMEFRAME } from '../../consts.js'

export const makeRelyModel = (opts?: RelyOptions): EnvelopeModel<RelyChallenge> => {
  const envelope = makeEnvelopeModel<RelyChallenge>(RELY_3RD)

  const startTime = Date.now()
  const pinLength = opts?.pinLength ?? 4
  const checkLength = opts?.checkLenght ?? 2
  const tokenLength = 16
  const pinQty = Math.ceil(pinLength / 2)
  const checkQty = Math.ceil(checkLength / 2)
  const tokenQty = Math.ceil(tokenLength / 2)
  const source = createRandomPrefix(pinQty + checkQty + tokenQty)
  const bytes = base58.decode(source)
  const pinBytes = bytes.slice(0, pinQty)
  const checkBytes = bytes.slice(pinQty, pinQty + checkQty)
  const tokenBytes = bytes.slice(pinQty + checkQty)

  const pin = new DataView(pinBytes.buffer).getUint32(0).toString().substring(0, pinLength)
  envelope.send({
    pin,
    check: base32nopad.encode(checkBytes).substring(0, checkLength),
    token: base58.encode(tokenBytes).substring(0, tokenLength),
    nonce: createIdOfLength(tokenLength, IdStyle.Base64)
  }, opts?.liveTime ?? RELY_TIMEFRAME)

  console.log('Rely generetatd within: ', (Date.now() - startTime) / 1000, 's')

  const msg = envelope.message()
  console.log('!!!!!! Rely challenge:', msg)
  console.log('Rely pin length: ', msg.pin?.length, '/', pinLength)
  console.log('Rely check length: ', msg.check?.length, '/', checkLength)
  console.log('Rely token length: ', msg.token?.length, '/', tokenLength)
  console.log('Rely nonce length: ', msg.nonce?.length, '/', tokenLength)

  return envelope
}
