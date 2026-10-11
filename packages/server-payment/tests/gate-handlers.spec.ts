import { describe, expect, test } from 'bun:test'
import { contract, protocol } from '@owlmeans/entrypoint'
import type { EntrypointProtocol } from '@owlmeans/entrypoint'
import { PaygateError, UnknownPaygate } from '@owlmeans/payment'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { GUARD_ED25519 } from '@owlmeans/server-app'
import { bind, bindAll } from '@owlmeans/server-entrypoint'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import { paymentGate, paymentGateEntrypoints, paymentGateHandlers, webhookOf } from '../src/index.js'
import type { PaygateParams, ResyncResult, ResyncSubscriptionsResult } from '../src/index.js'
import { makeFakeContext } from './fake-stripe.js'
import type { FakeContext } from './fake-stripe.js'

const HOOKS = 'app-hooks'
const HOOKS_HOST = 'hooks.example.com'

/**
 * The gate as an application re-declares it: its OWN aliases, every route pinned to its own
 * service, and the library's paths, contracts and guards — typed with the library's own request and
 * reply shapes, so a handler bound to it type-checks exactly as it does on `paymentGate`.
 */
const ownBase = protocol(route('app-hooks:gate', '/payment-gate', backend({ service: HOOKS })), contract())
const own = {
  base: ownBase,
  webhook: protocol(
    route('app-hooks:gate:webhook', '/webhook/:paygate', backend({ parent: ownBase, method: RouteMethod.POST, service: HOOKS })),
    paymentGate.webhook.contract!,
  ) as EntrypointProtocol<{ params: PaygateParams }, undefined>,
  resync: protocol(
    route('app-hooks:gate:resync', '/resync', backend({ parent: ownBase, method: RouteMethod.POST, service: HOOKS })),
    paymentGate.resync.contract!, { guards: GUARD_ED25519 },
  ) as EntrypointProtocol<{}, ResyncResult>,
  resyncSubscriptions: protocol(
    route('app-hooks:gate:resync-subscriptions', '/resync-subscriptions', backend({ parent: ownBase, method: RouteMethod.POST, service: HOOKS })),
    paymentGate.resyncSubscriptions.contract!, { guards: GUARD_ED25519 },
  ) as EntrypointProtocol<{}, ResyncSubscriptionsResult>,
}

const ownEntrypoints = (): ServerEntrypoint<object>[] => [
  bind(own.base),
  bind(own.webhook, paymentGateHandlers.webhook),
  bind(own.resync, paymentGateHandlers.resync),
  bind(own.resyncSubscriptions, paymentGateHandlers.resyncSubscriptions),
]

/** The hook receiver: a process whose `cfg.service` is the application's own hook service. */
const hookProcess = async (manage: boolean): Promise<FakeContext> => await makeFakeContext({
  service: HOOKS, host: HOOKS_HOST, gateway: { manage, bootstrap: false },
})

/** Run a bound route the way the transport does. */
const run = async (entrypoint: ServerEntrypoint<object>, params: Record<string, string> = {}): Promise<{ value?: unknown, error?: Error }> => {
  const response: { value?: unknown, error?: Error, resolve: (value: unknown) => void, reject: (error: Error) => void } = {
    resolve: value => { response.value = value },
    reject: error => { response.error = error },
  }
  await entrypoint.handle({ alias: entrypoint.alias, params, query: {}, body: {}, headers: {}, path: '/' } as never, response as never)

  return response
}

describe('@owlmeans/server-payment — the payment gate handlers', () => {
  test('are exported once, frozen, and are the implementations the library\'s own bindings use', () => {
    expect(Object.keys(paymentGateHandlers).sort()).toEqual(['resync', 'resyncSubscriptions', 'webhook'])
    expect(Object.isFrozen(paymentGateHandlers)).toBe(true)
    for (const handler of Object.values(paymentGateHandlers)) {
      expect(typeof handler.bind).toBe('function')
    }
    expect(paymentGateEntrypoints.map(entrypoint => [entrypoint.alias, typeof entrypoint.handle])).toEqual([
      [paymentGate.base.alias, 'undefined'],
      [paymentGate.webhook.alias, 'function'],
      [paymentGate.resync.alias, 'function'],
      [paymentGate.resyncSubscriptions.alias, 'function'],
    ])
  })

  test('bind onto an application\'s own pinned declarations, which keep their aliases, service and guards', () => {
    const bound = ownEntrypoints()

    expect(bound.map(entrypoint => entrypoint.alias)).toEqual(
      [own.base, own.webhook, own.resync, own.resyncSubscriptions].map(declaration => declaration.alias))
    expect(bound.every(entrypoint => entrypoint.route.route.service === HOOKS)).toBe(true)
    expect(bound.map(entrypoint => typeof entrypoint.handle)).toEqual(['undefined', 'function', 'function', 'function'])
    expect(bound[1]!.guards).toEqual([])
    expect(bound[2]!.guards).toEqual([GUARD_ED25519])
    expect(bound[3]!.guards).toEqual([GUARD_ED25519])
  })

  test('bindAll pairs by object identity: it leaves another declaration without a handler', () => {
    const paired = bindAll([own.webhook], [paymentGateHandlers.webhook])

    expect(paired[0]!.handle).toBeUndefined()
  })

  test('run in the context of the entrypoint they are bound to — the library\'s own is never registered', async () => {
    const unmanaged = await hookProcess(false)
    const [, webhook, resync] = ownEntrypoints()
    unmanaged.ctx.registerEntrypoints([ownEntrypoints()[0]!, webhook!, resync!] as never)

    expect(unmanaged.ctx.hasEntrypoint(paymentGate.webhook.alias)).toBe(false)
    expect((await run(webhook!, { paygate: 'paypal' })).error).toBeInstanceOf(UnknownPaygate)
    // Reached this process's gateway: unmanaged here, so a Stripe delivery and a resync are refused.
    expect((await run(webhook!, { paygate: 'stripe' })).error).toBeInstanceOf(PaygateError)
    expect((await run(resync!)).error).toBeInstanceOf(PaygateError)

    const managed = await hookProcess(true)
    const [base, , , resyncSubscriptions] = ownEntrypoints()
    managed.ctx.registerEntrypoints([base!, resyncSubscriptions!] as never)

    expect(await run(resyncSubscriptions!)).toEqual(expect.objectContaining({ value: { scanned: 0, updated: 0 } }))
  })

  test('the application\'s webhook path is the one Stripe is pointed at — a re-declaration keeps the library\'s path', async () => {
    const hooks = await hookProcess(false)

    expect(webhookOf(hooks.ctx).webhookUrlOf()).toBe(`https://${HOOKS_HOST}/payment-gate/webhook/stripe`)
    expect([own.base.route.route.path, own.webhook.route.route.path])
      .toEqual([paymentGate.base.route.route.path, paymentGate.webhook.route.route.path])
  })
})
