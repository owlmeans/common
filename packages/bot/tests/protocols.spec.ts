import { describe, expect, test } from 'bun:test'
import { protocols } from '@owlmeans/entrypoint'
import { RouteMethod } from '@owlmeans/route'
import { makeBotHookProtocols, makeBotProtocols } from '../src/index.js'

const BASE = 'api:bot:operator'
const gate = { alias: 'gate:oidc', params: ['operator'] }

describe('makeBotProtocols', () => {
  const tree = makeBotProtocols({ base: { alias: BASE, path: '/bot/operator' }, guards: 'guard:default', gates: gate })

  test('declares exactly the leaves of the contract, each alias derived from the base alias', () => {
    const declared = protocols(tree as never).map(protocol => protocol.alias)

    expect(declared.sort()).toEqual([
      BASE,
      `${BASE}:connection:list`, `${BASE}:connection:save`, `${BASE}:connection:verify`,
      `${BASE}:connection:remove`, `${BASE}:connection:simulate`,
      `${BASE}:rule:list`, `${BASE}:rule:save`, `${BASE}:rule:remove`,
      `${BASE}:activity:list`,
    ].sort())
  })

  test('every leaf has its method and path, hanging under the base', () => {
    const routes = [
      [tree.connection.list, RouteMethod.GET, '/connections'],
      [tree.connection.save, RouteMethod.POST, '/connections'],
      [tree.connection.verify, RouteMethod.POST, '/connections/:id/verify'],
      [tree.connection.remove, RouteMethod.DELETE, '/connections/:id'],
      [tree.connection.simulate, RouteMethod.POST, '/connections/:id/simulate'],
      [tree.rule.list, RouteMethod.GET, '/rules'],
      [tree.rule.save, RouteMethod.POST, '/rules'],
      [tree.rule.remove, RouteMethod.DELETE, '/rules/:id'],
      [tree.activity.list, RouteMethod.GET, '/activity'],
    ] as const

    for (const [leaf, method, path] of routes) {
      expect([leaf.alias, leaf.route.route.method, leaf.route.route.path, leaf.route.route.parent])
        .toEqual([leaf.alias, method, path, BASE])
    }
    expect(tree.connection.save.contract?.requestSchemas.body).toBeDefined()
    expect(tree.connection.simulate.contract?.requestSchemas.params).toBeDefined()
    expect(tree.activity.list.contract?.requestSchemas.query).toBeDefined()
  })

  test('the guards and the gate sit on the base alone; the tree is frozen', () => {
    expect(tree.base.guards).toEqual(['guard:default'])
    expect(tree.base.gate).toEqual(gate)
    expect(tree.base.route.route.path).toBe('/bot/operator')
    expect(tree.rule.list.guards).toEqual([])
    expect(tree.rule.list.gate).toBeUndefined()
    expect(Object.isFrozen(tree) && Object.isFrozen(tree.connection) && Object.isFrozen(tree.rule.save)).toBe(true)
  })

  test('two mounts are two alias families, and parent and service reach the base', () => {
    const member = makeBotProtocols({ base: { alias: 'api:bot:member', path: '/bot/member', parent: 'api', service: 'api' } })

    expect(member.connection.list.alias).toBe('api:bot:member:connection:list')
    expect(member.base.route.route).toMatchObject({ parent: 'api', service: 'api' })
    expect(member.base.guards).toEqual([])
  })
})

describe('makeBotHookProtocols', () => {
  const hook = makeBotHookProtocols({ base: { alias: 'api:bot:hook', path: '/bot/hook' } })

  test('receive is POST and challenge GET, both at /:platform/:connection', () => {
    expect(protocols(hook as never).map(protocol => protocol.alias).sort())
      .toEqual(['api:bot:hook', 'api:bot:hook:challenge', 'api:bot:hook:receive'])
    expect(hook.receive.route.route).toMatchObject({ method: RouteMethod.POST, path: '/:platform/:connection', parent: 'api:bot:hook' })
    expect(hook.challenge.route.route).toMatchObject({ method: RouteMethod.GET, path: '/:platform/:connection', parent: 'api:bot:hook' })
  })

  test('carries no guard and no gate anywhere — the platform signs', () => {
    for (const protocol of protocols(hook as never)) {
      expect([protocol.alias, protocol.guards, protocol.gate]).toEqual([protocol.alias, [], undefined])
    }
    expect(hook.receive.contract?.requestSchemas.body).toBeUndefined()
  })
})
