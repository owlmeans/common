import { describe, expect, test } from 'bun:test'
import { AppType } from '@owlmeans/context'
import { contract, gatesOf, protocol, protocols } from '@owlmeans/entrypoint'
import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { makeCheckoutReadProtocols, makeConsumerRightsProtocols } from '../src/index.js'

const accountBase = protocol(route('spec:account:base', '/account', backend()), contract(), {
  guards: 'spec-guard',
  gate: { alias: 'spec-gate', params: 'spec-account-{entity}' },
})

const shape = (declaration: EntrypointProtocolDeclaration) => ({
  alias: declaration.alias,
  path: declaration.route.route.path,
  method: declaration.route.route.method,
  parent: declaration.route.route.parent,
})

describe('makeConsumerRightsProtocols', () => {
  const tree = makeConsumerRightsProtocols({ prefix: 'spec:consumer', parent: accountBase })

  test('the account subtree hangs under the guarded parent', () => {
    expect(shape(tree.base)).toMatchObject({ alias: 'spec:consumer:base', path: '/consumer-rights', parent: accountBase.alias })
    expect(tree.base.guards).toEqual([])
    expect(gatesOf(tree.giveConsent, { accountBase, ...tree })).toEqual([{ alias: 'spec-gate', params: ['spec-account-{entity}'] }])
    expect([
      shape(tree.profile), shape(tree.purchases), shape(tree.consent), shape(tree.giveConsent), shape(tree.start),
      shape(tree.requestStart), shape(tree.withdrawals), shape(tree.withdraw), shape(tree.cancel),
    ]).toEqual([
      { alias: 'spec:consumer:profile', path: '/profile', method: RouteMethod.GET, parent: 'spec:consumer:base' },
      { alias: 'spec:consumer:purchases', path: '/purchases', method: RouteMethod.GET, parent: 'spec:consumer:base' },
      { alias: 'spec:consumer:consent', path: '/consent', method: RouteMethod.GET, parent: 'spec:consumer:base' },
      { alias: 'spec:consumer:consent:give', path: '/consent', method: RouteMethod.POST, parent: 'spec:consumer:base' },
      { alias: 'spec:consumer:start', path: '/start', method: RouteMethod.GET, parent: 'spec:consumer:base' },
      { alias: 'spec:consumer:start:request', path: '/start', method: RouteMethod.POST, parent: 'spec:consumer:base' },
      { alias: 'spec:consumer:withdrawals', path: '/withdrawal', method: RouteMethod.GET, parent: 'spec:consumer:base' },
      { alias: 'spec:consumer:withdraw', path: '/withdrawal', method: RouteMethod.POST, parent: 'spec:consumer:base' },
      { alias: 'spec:consumer:cancel', path: '/cancellation', method: RouteMethod.POST, parent: 'spec:consumer:base' },
    ])
  })

  test('without public options there is no public key at all, so the tree flattens cleanly', () => {
    expect('public' in tree).toBe(false)
    expect(protocols(tree)).toHaveLength(10)
    expect(Object.values(tree).every(value => value != null)).toBe(true)
  })

  test('declares the request and response schemas', () => {
    expect(tree.start.contract?.requestSchemas.query).toMatchObject({ required: ['planSku'] })
    expect(tree.giveConsent.contract?.requestSchemas.body).toMatchObject({ required: ['purchaseIds', 'textVersion', 'language', 'acknowledged'] })
    expect(tree.withdraw.contract?.responseSchemas?.default).toMatchObject({ required: expect.arrayContaining(['status']) })
  })

  test('the public subtree has no guard and no gate, and its receipts disclose nothing', () => {
    const open = makeConsumerRightsProtocols({ prefix: 'spec:consumer', parent: accountBase, public: {} })
    expect(shape(open.public.base)).toMatchObject({ alias: 'spec:consumer:public:base', path: '/public/consumer-rights' })
    expect(open.public.base.route.route.parent).toBeUndefined()
    expect([open.public.policy, open.public.withdraw, open.public.cancel].map(shape)).toEqual([
      { alias: 'spec:consumer:public:policy', path: '/policy', method: RouteMethod.GET, parent: 'spec:consumer:public:base' },
      { alias: 'spec:consumer:public:withdraw', path: '/withdrawal', method: RouteMethod.POST, parent: 'spec:consumer:public:base' },
      { alias: 'spec:consumer:public:cancel', path: '/cancellation', method: RouteMethod.POST, parent: 'spec:consumer:public:base' },
    ])
    for (const declaration of protocols(open.public)) {
      expect(declaration.guards).toEqual([])
      expect(gatesOf(declaration, open.public)).toEqual([])
    }
    expect(open.public.withdraw.contract?.responseSchemas?.default?.properties).not.toHaveProperty('status')
    expect('screens' in open.public).toBe(false)
    expect(protocols(open)).toHaveLength(14)
  })

  test('the public screens are sticky frontend routes', () => {
    const open = makeConsumerRightsProtocols({
      prefix: 'spec:consumer', parent: accountBase, public: { path: '/legal-api', screens: { cancellation: '/cancel' } },
    })
    expect(open.public.base.route.route.path).toBe('/legal-api')
    expect(open.public.screens.cancellation).toMatchObject({ alias: 'spec:consumer:public:screen:cancellation', sticky: true })
    expect(open.public.screens.cancellation.route.route).toMatchObject({ path: '/cancel', type: AppType.Frontend })
    expect(open.public.screens.withdrawal.route.route).toMatchObject({ path: '/legal/withdraw', type: AppType.Frontend })
    expect(protocols(open)).toHaveLength(16)
  })

  test('a tree with neither a parent nor guards is a declaration error; guards alone mount it', () => {
    expect(() => makeConsumerRightsProtocols({ prefix: 'spec:bare' })).toThrow(SyntaxError)
    const guarded = makeConsumerRightsProtocols({ prefix: 'spec:bare', guards: 'spec-guard', path: '/rights' })
    expect(guarded.base.guards).toEqual(['spec-guard'])
    expect(guarded.base.route.route).toMatchObject({ path: '/rights', type: AppType.Backend })
  })
})

describe('makeCheckoutReadProtocols', () => {
  test('amount policy and plan prices under the guarded parent, with query schemas', () => {
    const tree = makeCheckoutReadProtocols({ prefix: 'spec:checkout', parent: accountBase })
    expect([tree.base, tree.amountPolicy, tree.planPrices].map(shape)).toEqual([
      { alias: 'spec:checkout:base', path: '/checkout', method: undefined, parent: accountBase.alias },
      { alias: 'spec:checkout:amount-policy', path: '/amount-policy', method: RouteMethod.GET, parent: 'spec:checkout:base' },
      { alias: 'spec:checkout:plan-prices', path: '/plan-prices', method: RouteMethod.GET, parent: 'spec:checkout:base' },
    ])
    expect(tree.amountPolicy.contract?.requestSchemas.query).toMatchObject({ required: ['productSku'] })
    expect(() => makeCheckoutReadProtocols({ prefix: 'spec:checkout' })).toThrow(SyntaxError)
  })
})
