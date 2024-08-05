import { base64, utf8 } from '@scure/base'
import { DEFAULT_TTL, EnvelopeKind } from './consts.js'
import type { EnvelopeModel } from './types.js'
import { tokenize, untokenize, unwrap, wrap } from './utils/model.js'

export const makeEnvelopeModel = <T extends {} | string = string>(
  type: string, kind?: EnvelopeKind
): EnvelopeModel<T> => {
  const model: EnvelopeModel = {
    envelope: kind == null ? {
      t: type,
      msg: '',
      dt: new Date().getTime(),
      ttl: DEFAULT_TTL
    } : kind === EnvelopeKind.Wrap
      ? unwrap(type) : untokenize(type),

    send: (msg, ttl) => {
      model.envelope.msg = typeof msg == 'string' ? msg : base64.encode(utf8.decode(JSON.stringify(msg)))
      if (typeof ttl !== 'undefined') {
        model.envelope.ttl = ttl
      }

      return model
    },

    message: <T>() => {
      try {
        return JSON.parse(utf8.encode(base64.decode(model.envelope.msg))) as T
      } catch {
        return model.envelope.msg as T
      }
    },

    type: () => model.envelope.t,

    wrap: () => wrap(model.envelope),

    tokenize: () => tokenize(model.envelope),

    sign: async (key, kind) => {
      model.envelope.sig = await key.sign(model.envelope)
      switch (kind) {
        case EnvelopeKind.Wrap:
          return model.wrap()
        case EnvelopeKind.Token:
          return model.tokenize()
        default:
          return model.envelope.sig
      }
    },

    verify: async key => {
      const signature = model.envelope.sig
      if (signature == null) {
        return false
      }
      if (model.envelope.ttl != null
        && model.envelope.dt + model.envelope.ttl < new Date().getTime()) {
        return false
      }

      const data = { ...model.envelope }
      delete data.sig

      return await key.verify(data, signature)
    }
  }

  return model
}
