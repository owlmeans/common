import { describe, expect, test } from 'bun:test'
import { protocols } from '@owlmeans/entrypoint'
import { RouteMethod, RouteProtocols } from '@owlmeans/route'
import { makePlanningProtocols } from '../src/entrypoints.js'
import { PLANNING_PATH, planningAliases } from '../src/consts.js'

const BASE = 'app:api:planning'

describe('makePlanningProtocols', () => {
  test('declares every leaf once, each alias derived from the base alias', () => {
    const tree = makePlanningProtocols({ base: { alias: BASE }, guards: 'guard:default' })
    const aliases = planningAliases(BASE)
    const declared = protocols(tree as never).map(protocol => protocol.alias)

    expect(new Set(declared).size).toBe(declared.length)
    expect(declared.sort()).toEqual([
      aliases.base, aliases.schema.list, aliases.card.list, aliases.card.summary, aliases.card.get,
      aliases.card.transitions, aliases.card.specifications, aliases.spec.get, aliases.spec.revisions,
      aliases.link.list, aliases.transition.get, aliases.execute, aliases.commit.get, aliases.commit.events,
    ].sort())
    expect(declared.every(alias => alias.startsWith(`${BASE}`))).toBe(true)
  })

  test('the guard, gate, parent and service sit on the base alone; leaves hang under it', () => {
    const gate = { alias: 'gate:owner', params: ['vib-project-{entity}'] }
    const tree = makePlanningProtocols({
      base: { alias: BASE, parent: 'app:api', service: 'api' }, guards: ['guard:default'], gate,
    })

    expect(tree.base.guards).toEqual(['guard:default'])
    expect(tree.base.gate).toEqual(gate)
    expect(tree.base.route.route).toMatchObject({ path: PLANNING_PATH, parent: 'app:api', service: 'api' })
    expect(tree.card.get.guards).toEqual([])
    expect(tree.card.get.route.route.parent).toBe(BASE)
    expect(tree.execute.route.route.method).toBe(RouteMethod.POST)
    expect(tree.card.list.route.route.method).toBe(RouteMethod.GET)
  })

  test('static /cards/summary is declared before parametric /cards/:id', () => {
    const tree = makePlanningProtocols({ base: { alias: BASE }, guards: 'guard:default' })
    const order = Object.keys(tree.card)

    expect(tree.card.summary.route.route.path).toBe('/cards/summary')
    expect(tree.card.get.route.route.path).toBe('/cards/:id')
    expect(order.indexOf('summary')).toBeLessThan(order.indexOf('get'))
    expect(tree.card.list.contract?.requestSchemas.query).toBeDefined()
  })

  test('the commit feed is a socket under socketBase when given, under the planning base otherwise', () => {
    const own = makePlanningProtocols({ base: { alias: BASE }, guards: 'guard:default' })
    const shared = makePlanningProtocols({ base: { alias: BASE }, guards: 'guard:default', socketBase: 'app:update' })

    expect(own.commit.events.route.route).toMatchObject({ protocol: RouteProtocols.SOCKET, parent: BASE, path: '/commits' })
    expect(shared.commit.events.route.route.parent).toBe('app:update')
    expect(Object.isFrozen(shared) && Object.isFrozen(shared.commit.events)).toBe(true)
  })
})
