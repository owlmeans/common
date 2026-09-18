import { describe, expect, test } from 'bun:test'
import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { handlers } from '../src/protocol.js'
import { HandlerMisconfiguredError } from '../src/errors.js'

/**
 * A protocol-bound implementation is run with the smallest binding context the transport needs —
 * same pattern as `@owlmeans/server-auth-token`'s own `handlers.spec.ts`.
 */
const invoke = async (handler: any, context: any, req: any = {}): Promise<any> => {
  const res: any = { resolve: (value: unknown) => { res.value = value }, reject: (e: Error) => { res.error = e } }
  await handler.bind({ ref: { ctx: context } })(req, res)
  if (res.error != null) throw res.error

  return res.value
}

const protocolFor = (alias: string): EntrypointProtocolDeclaration =>
  ({ alias } as unknown as EntrypointProtocolDeclaration)

const context = { alias: 'test-context' } as any
const api = handlers<any>()

describe('@owlmeans/server-api — handlers() wrap-once tolerance', () => {
  test('a plain function is wrapped once and called with the context', async () => {
    const protocol = protocolFor('api.thing.plain')
    const handler = api.request(protocol, async (_req: any, ctx: any) => ({ ok: true, ctx }))

    const result = await invoke(handler, context, {})
    expect(result).toEqual({ ok: true, ctx: context })
  })

  test('a handler already bound to the SAME protocol is returned unchanged by body/params/request and still answers', async () => {
    for (const method of ['body', 'params', 'request'] as const) {
      const protocol = protocolFor(`api.thing.${method}`)
      const bound = api.request(protocol, async () => ({ from: method }))

      const wrapped = (api as any)[method](protocol, bound)
      expect(wrapped).toBe(bound)

      const result = await invoke(wrapped, context, {})
      expect(result).toEqual({ from: method })
    }
  })

  test('a handler bound to a DIFFERENT protocol answers with HandlerMisconfiguredError', async () => {
    const protocolA = protocolFor('api.thing.mismatch-a')
    const protocolB = protocolFor('api.thing.mismatch-b')
    const boundToA = api.request(protocolA, async () => ({ from: 'a' }))

    const wrapped = api.request(protocolB, boundToA as any)
    expect(wrapped).not.toBe(boundToA)
    await expect(invoke(wrapped, context, {})).rejects.toThrow(HandlerMisconfiguredError)
  })

  test('a value that is neither a function nor a bound handler answers with HandlerMisconfiguredError', async () => {
    const protocol = protocolFor('api.thing.not-a-function')
    const wrapped = api.request(protocol, { not: 'a function' } as any)

    await expect(invoke(wrapped, context, {})).rejects.toThrow(HandlerMisconfiguredError)
  })

  test('the double-wrap warning fires once per alias, not once per call', async () => {
    const protocol = protocolFor('api.thing.warn-once')
    const bound = api.request(protocol, async () => 'ok')

    const warnings: unknown[][] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => { warnings.push(args) }
    try {
      // Each call is a deliberate double wrap — the exact shape `tsc` rejects at the real call
      // site (TS2345) — so it is exercised here through `any`, the same way `body`/`params`
      // are reached dynamically above.
      (api as any).request(protocol, bound);
      (api as any).body(protocol, bound);
      (api as any).params(protocol, bound)
    } finally {
      console.warn = original
    }

    expect(warnings.length).toBe(1)
  })
})
