import { afterAll, describe, expect, test } from 'bun:test'
import { IntrinsicStatus, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { PlanningPlugin, StatusFlowSchema, WorkcardTypeSchema } from '@owlmeans/planning'
import { conformanceFixturesOf, planningConformancePlugin } from '@owlmeans/server-planning/conformance'

import { gate, makeSuite, raw } from './context.js'

/**
 * The application's own definition properties live inside the `definition` jsonb of a
 * `planning-schema` row, and its base card fields inside a card's `fields` — nothing in the tables
 * names them. A second boot over the same schema must read them back unchanged.
 */
const suite = makeSuite('app')

const APP: PlanningPlugin = {
  name: 'library-app',
  schemas: {
    app: {
      type: { properties: { description: { type: 'string' } } },
      flow: { properties: { description: { type: 'string' } } },
      card: { properties: { shelfmark: { type: 'string' } } },
    },
  },
}

const RACK: StatusFlowSchema = {
  id: 'library:rack', version: 1, app: { description: 'On the rack' },
  statuses: [{ key: 'racked', intrinsic: IntrinsicStatus.Planned, initial: true }], transitions: [],
}

const LEAFLET: WorkcardTypeSchema = {
  type: 'library:leaflet', kind: WorkcardKind.Card, version: 1, flows: [RACK.id], specifications: [],
  fields: { type: 'object', additionalProperties: false }, app: { description: 'A folded sheet' },
}

describe('@owlmeans/planning-postgres — application declarations', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  afterAll(async () => {
    await suite.teardown()
  })

  test('app bags and base fields round-trip through the tables and a second boot', async () => {
    const plugins = [planningConformancePlugin, APP]
    const first = await suite.boot({ plugins })
    const org = 'org-app-round-trip'
    await first.facade(org).definitions!.define({ flows: [RACK], types: [LEAFLET] })
    const branch = await conformanceFixturesOf(first.facade(org)).createBranch()
    const card = (await first.facade(org).execute({
      card: { kind: WorkcardKind.Card, type: LEAFLET.type, parent: branch.id!, title: 'Hours', fields: { shelfmark: 'L-1' } },
      action: TransitionAction.Create,
    }, { wait: true })).card!

    const rows = await raw(async pool => (await pool.query(
      `SELECT "key", "definition" -> 'app' AS app FROM "${suite.schema}"."planning_schema" WHERE "entityId" = $1 AND "kind" <> 'head' ORDER BY "key"`,
      [org],
    )).rows)
    expect(rows).toEqual([{ key: LEAFLET.type, app: LEAFLET.app }, { key: RACK.id, app: RACK.app }])

    const second = await suite.boot({ plugins })
    const layer = await second.facade(org).definitions!.registry()
    expect([layer.type(LEAFLET.type).app, layer.flow(RACK.id).app]).toEqual([LEAFLET.app, RACK.app])
    expect((await second.facade(org).cards.get(card.id!)).fields).toEqual({ shelfmark: 'L-1' })
    expect(layer.validator(LEAFLET.type)({ shelfmark: 7 })).toBe(false)
  })
})
