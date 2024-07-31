import { base64, base64urlnopad, utf8 } from '@scure/base'
import type { Envelope } from '../types.js'

export const wrap = (object: Envelope): string => 
  base64.encode(utf8.decode(JSON.stringify(object)))

export const tokenize = (object: Envelope): string =>
  base64urlnopad.encode(utf8.decode(JSON.stringify(object)))

export const untokenize = (token: string): Envelope =>
  JSON.parse(utf8.encode(base64urlnopad.decode(token)))

export const unwrap = (envelope: string): Envelope =>
  JSON.parse(utf8.encode(base64.decode(envelope)))
