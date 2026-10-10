import { describe, expect, test } from 'bun:test'
import { addLogPlugin, memoryPlugin } from '@owlmeans/log'
import { pgDeclarationHelper, pgSchemaHelper } from '@owlmeans/postgres-resource'

import {
  makePlanningCardPostgres, makePlanningLinkPostgres, makePlanningSchemaPostgres, makePlanningTransitionPostgres,
  PlanningCardTableSchema, PlanningLinkTableSchema, PlanningSchemaTableSchema, PlanningTransitionTableSchema,
  RES_PLANNING_CARD, RES_PLANNING_LINK, RES_PLANNING_SCHEMA, RES_PLANNING_TRANSITION,
} from '../src/index.js'

/**
 * No database: `schemaToTableSpec` is the compiler `init()` runs, so what a table becomes is pinned
 * here — above all that no timestamp becomes `timestamptz`, which would marshal through `Date` and
 * break the ISO-string order the store relies on.
 */
describe('@owlmeans/planning-postgres — table shapes', () => {
  test('the card table: text timestamps, integer counters, text body, a private headAt', () => {
    const spec = pgSchemaHelper.schemaToTableSpec(RES_PLANNING_CARD, PlanningCardTableSchema, 'app', 'planning_card', true)
    const typeOf = (property: string) => [spec.byProperty[property].sqlType, spec.byProperty[property].jsonType]

    for (const timestamp of ['createdAt', 'updatedAt', 'closedAt', 'headAt']) {
      expect([timestamp, ...typeOf(timestamp)]).toEqual([timestamp, 'text', 'string'])
    }
    for (const counter of ['seq', 'head', 'revision', 'bodyChars']) {
      expect([counter, typeOf(counter)[0]]).toEqual([counter, 'integer'])
    }
    expect(typeOf('body')[0]).toBe('text')
    expect(typeOf('order')[0]).toBe('double precision')
    expect([spec.byProperty.parents.array, spec.byProperty.labels.array]).toEqual([true, true])
    expect([spec.byProperty.fields.jsonb, spec.byProperty.flows.jsonb]).toEqual([true, true])
    expect(spec.byProperty.createdAt.notNull).toBe(true)
    expect(spec.byProperty.headAt.notNull).toBe(false)
  })

  test('the log, the links and the schema records keep text timestamps too', () => {
    const log = pgSchemaHelper.schemaToTableSpec(RES_PLANNING_TRANSITION, PlanningTransitionTableSchema, 'app', 'planning_transition', true)
    const links = pgSchemaHelper.schemaToTableSpec(RES_PLANNING_LINK, PlanningLinkTableSchema, 'app', 'planning_link', true)
    const schemas = pgSchemaHelper.schemaToTableSpec(RES_PLANNING_SCHEMA, PlanningSchemaTableSchema, 'app', 'planning_schema', true)

    expect([log.byProperty.at.sqlType, log.byProperty.seq.sqlType, log.byProperty.commit.jsonb]).toEqual(['text', 'integer', true])
    expect(links.byProperty.createdAt.sqlType).toBe('text')
    expect([schemas.byProperty.version.sqlType, schemas.byProperty.rev.sqlType, schemas.byProperty.project.sqlType]).toEqual(['integer', 'integer', 'text'])
    // The private revision row is a legal kind.
    expect(schemas.checks.find(check => check.name?.endsWith('_kind_enum'))?.expression).toContain(`'head'`)
  })

  test('each maker declares its indexes once, however often it runs', () => {
    for (const alias of [RES_PLANNING_CARD, RES_PLANNING_TRANSITION, RES_PLANNING_LINK, RES_PLANNING_SCHEMA]) {
      pgDeclarationHelper.resetDeclarations(alias)
    }
    const memory = memoryPlugin('planning-postgres-schema')
    const remove = addLogPlugin(memory)
    try {
      for (let run = 0; run < 2; run++) {
        makePlanningCardPostgres()
        makePlanningTransitionPostgres()
        makePlanningLinkPostgres()
        makePlanningSchemaPostgres()
      }
      const names = (alias: string) => pgDeclarationHelper.getDeclaration(alias).indexes.map(index => index.name).sort()

      expect(names(RES_PLANNING_CARD)).toEqual([
        'planning_card_code', 'planning_card_entity_intrinsic', 'planning_card_entity_kind_type', 'planning_card_labels',
        'planning_card_parent_order', 'planning_card_parent_status', 'planning_card_parents', 'planning_card_slot',
      ])
      expect(names(RES_PLANNING_TRANSITION)).toEqual([
        'planning_transition_card_seq', 'planning_transition_entity_key', 'planning_transition_pending', 'planning_transition_project_at',
      ])
      expect(names(RES_PLANNING_LINK)).toEqual([
        'planning_link_edge', 'planning_link_entity_type', 'planning_link_inbound', 'planning_link_project',
      ])
      expect(names(RES_PLANNING_SCHEMA)).toEqual(['planning_schema_rev', 'planning_schema_scope'])

      pgSchemaHelper.schemaToTableSpec(RES_PLANNING_CARD, PlanningCardTableSchema, 'app', 'planning_card', true, pgDeclarationHelper.getDeclaration(RES_PLANNING_CARD).indexes)
      expect(memory.records.filter(record => record.level === 'warn')).toEqual([])
    } finally {
      remove()
    }
  })

  test('the unique and partial indexes the store relies on', () => {
    const find = (alias: string, name: string) => pgDeclarationHelper.getDeclaration(alias).indexes.find(index => index.name === name)

    expect(find(RES_PLANNING_TRANSITION, 'planning_transition_card_seq')).toMatchObject({ columns: ['card', 'seq'], unique: true })
    expect(find(RES_PLANNING_TRANSITION, 'planning_transition_entity_key')).toMatchObject({ unique: true, where: '"key" IS NOT NULL' })
    expect(find(RES_PLANNING_TRANSITION, 'planning_transition_pending')?.where).toContain(`'pending'`)
    expect(find(RES_PLANNING_LINK, 'planning_link_edge')).toMatchObject({ expression: `"entityId", "from", "to", "type", COALESCE("fromKind", 'workcard'), COALESCE("toKind", 'workcard')`, unique: true })
    expect(find(RES_PLANNING_SCHEMA, 'planning_schema_scope')).toMatchObject({ unique: true })
    expect(find(RES_PLANNING_CARD, 'planning_card_parents')?.method).toBe('gin')
  })
})
