import { IamUnsupported } from './errors.js'
import { INERT_KEYS } from './consts.local.js'

/**
 * A facet a backend cannot provide: every method throws `IamUnsupported(what)`.
 *
 * It throws SYNCHRONOUSLY, because a facet may carry synchronous methods (`subjects.identify`) and a
 * rejected promise would hand those a value of the wrong type; an awaited call rejects the same way
 * either way. Caller code turns the refusal into a fallback, exactly as for any other unsupported
 * operation.
 */
export const unsupportedFacet = <T extends object>(what: string): T =>
  new Proxy(Object.freeze({}) as T, {
    get: (_, key) => typeof key === 'symbol' || INERT_KEYS.has(key)
      ? undefined
      : () => { throw new IamUnsupported(what) },
  })
