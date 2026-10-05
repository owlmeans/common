import type { Envelope } from '../../types.js'

/** The two serialized forms of an envelope: wrapped (base64) and tokenized (base64url). */
export interface EnvelopeUtils {
  wrap: (object: Envelope) => string
  tokenize: (object: Envelope) => string
  untokenize: (token: string) => Envelope
  unwrap: (envelope: string) => Envelope
}
