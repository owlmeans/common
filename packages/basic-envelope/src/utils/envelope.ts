import { base64, base64urlnopad, utf8 } from '@scure/base'
import type { Envelope } from '../types.js'
import type { EnvelopeUtils } from './envelope/types.js'

export const createEnvelopeUtils = (): EnvelopeUtils => {
  const wrap = (object: Envelope): string => 
    base64.encode(utf8.decode(JSON.stringify(object)))

  const tokenize = (object: Envelope): string =>
    base64urlnopad.encode(utf8.decode(JSON.stringify(object)))

  const untokenize = (token: string): Envelope =>
    JSON.parse(utf8.encode(base64urlnopad.decode(token)))

  const unwrap = (envelope: string): Envelope =>
    JSON.parse(utf8.encode(base64.decode(envelope)))

  return { wrap, tokenize, untokenize, unwrap }
}

export const envelopeUtils = createEnvelopeUtils()
