import { config, makeClientContext } from '@owlmeans/client-context'
import type { Config, Context } from '../src/types.js'

/**
 * A real, minimal client context — no mocking of the carrier or the transport, just enough
 * config plumbing (`hasService`/`registerService`/`service`, `cfg.socket`) for `connect()` and
 * `appendSocketStatus()` to work against.
 *
 * Left unconfigured: `hasService`/`registerService` work before `configure()`/`init()`, and
 * `connect()` never calls `.service()` when nothing is registered — a test that DOES need a
 * registered service's methods (`appendSocketStatus`'s `ctx.socketStatus()`) must register it
 * and then run `ctx.configure(); await ctx.init()` itself, since a context only calls a
 * service's own `init()` once, during that pass.
 */
export const makeTestContext = (socket?: Config['socket']): Context => {
  const cfg = config<Config>('client-socket-tests')
  cfg.socket = socket

  return makeClientContext<Config, Context>(cfg)
}
