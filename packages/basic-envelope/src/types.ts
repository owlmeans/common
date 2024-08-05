import type { KeyPairModel } from '@owlmeans/basic-keys'
import type { EnvelopeKind } from './consts'

export interface Envelope {
  t: string
  msg: string
  sig?: string
  dt: number
  ttl: number | null
}

export interface EnvelopeModel<T extends {} | string = string> {
  envelope: Envelope
  send: <M extends T>(msg: M, ttl?: number | null) => EnvelopeModel
  wrap: () => string
  tokenize: () => string
  message: <M extends T>() => M
  type: () => string
  sign: (key: KeyPairModel, kind?: EnvelopeKind) => Promise<string>
  verify: (key: KeyPairModel) => Promise<boolean>
}
