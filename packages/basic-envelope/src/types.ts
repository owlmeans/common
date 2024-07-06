import type { KeyPairModel } from '@owlmeans/basic-keys'
import type { EnvelopeKind } from './consts'

export interface Envelope {
  t: string
  msg: string
  sig?: string
  dt: number
  ttl: number
}

export interface EnvelopeModel {
  envelope: Envelope
  send: (msg: unknown, ttl?: number) => EnvelopeModel
  wrap: () => string
  tokenize: () => string
  message: <T>() => T
  type: () => string
  sign: (key: KeyPairModel, kind?: EnvelopeKind) => Promise<string>
  verify: (key: KeyPairModel) => Promise<boolean>
}
