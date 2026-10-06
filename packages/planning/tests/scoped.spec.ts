import { describe, expect, test } from 'bun:test'
import {
  IntrinsicStatus, PlanningSchemaKind, SchemaOrigin, WorkcardKind,
} from '../src/consts.js'
import { PlanningUnsupported, SchemaInvalid, SchemaSealed } from '../src/errors.js'
import { makeSchemaRegistry } from '../src/registry.js'
import type {
  ProjectTypeSchema, ScopedSchemaRecord, StatusFlowSchema, WorkcardTypeSchema,
} from '../src/types.js'
import { scopedSchemaHelper } from '../src/helpers/scoped.js'

/** A community garden: plots are tended through a season flow; a shared tool shed is sealed. */
const SEASON: StatusFlowSchema = {
  id: 'garden:season',
  version: 1,
  overridable: true,
  statuses: [
    { key: 'fallow', intrinsic: IntrinsicStatus.Planned, initial: true },
    { key: 'growing', intrinsic: IntrinsicStatus.InProgress },
    { key: 'harvested', intrinsic: IntrinsicStatus.Closed },
  ],
  transitions: [
    { name: 'sow', from: ['fallow'], to: 'growing' },
    { name: 'harvest', from: ['growing'], to: 'harvested' },
  ],
}

const ROTA: StatusFlowSchema = {
  id: 'garden:rota',
  version: 1,
  statuses: [{ key: 'open', intrinsic: IntrinsicStatus.Planned, initial: true }],
  transitions: [],
}

const PLOT: WorkcardTypeSchema = {
  type: 'garden:plot', kind: WorkcardKind.Card, version: 1, overridable: true,
  fields: { type: 'object' }, flows: [SEASON.id], specifications: [],
}

const SHED: WorkcardTypeSchema = {
  type: 'garden:shed', kind: WorkcardKind.Card, version: 1,
  fields: { type: 'object' }, flows: [ROTA.id], specifications: [],
}

const GARDEN: ProjectTypeSchema = {
  type: 'garden:site', kind: WorkcardKind.Project, version: 1, fields: { type: 'object' },
  flows: [ROTA.id], specifications: [], cardTypes: [PLOT.type], scopedCardTypes: true,
}

const code = makeSchemaRegistry({ flows: [SEASON, ROTA], types: [PLOT, SHED, GARDEN] })

const record = (patch: Partial<ScopedSchemaRecord> & Pick<ScopedSchemaRecord, 'kind' | 'key' | 'definition'>): ScopedSchemaRecord => ({
  entityId: 'org-1', version: 1, createdAt: '2026-09-01T00:00:00.000Z', ...patch,
})

const BED: WorkcardTypeSchema = {
  type: 'garden:bed', kind: WorkcardKind.Card, version: 1, fields: { type: 'object' }, flows: [SEASON.id], specifications: [],
}

describe('scoped schemas — layering', () => {
  test('an organization record adds a type, a project record overrides it for that project only', () => {
    const records = [
      record({ kind: PlanningSchemaKind.Type, key: BED.type, definition: BED }),
      record({ kind: PlanningSchemaKind.Type, key: BED.type, project: 'site-1', version: 3, definition: { ...BED, label: 'Raised bed' } }),
    ]

    const shared = scopedSchemaHelper.scopedRegistryOf(scopedSchemaHelper.resolveScopedBundle(code.bundle(), records, { entityId: 'org-1', revision: 2 }))
    const site = scopedSchemaHelper.scopedRegistryOf(scopedSchemaHelper.resolveScopedBundle(code.bundle(), records, { entityId: 'org-1', project: 'site-1' }))
    const other = scopedSchemaHelper.scopedRegistryOf(scopedSchemaHelper.resolveScopedBundle(code.bundle(), records, { entityId: 'org-2' }))

    expect(shared.type(BED.type).label).toBeUndefined()
    expect(shared.originOf(PlanningSchemaKind.Type, BED.type)).toBe(SchemaOrigin.Entity)
    expect(shared.revision).toBe(2)
    expect(site.type(BED.type)).toMatchObject({ label: 'Raised bed', version: 3 })
    expect(site.originOf(PlanningSchemaKind.Type, BED.type)).toBe(SchemaOrigin.Project)
    expect(site.originOf(PlanningSchemaKind.Type, PLOT.type)).toBe(SchemaOrigin.Code)
    expect(other.has(BED.type)).toBe(false)
  })

  test('a sealed code key ignores a record; an overridable one takes it', () => {
    const records = [
      record({ kind: PlanningSchemaKind.Type, key: SHED.type, definition: { ...SHED, label: 'Hijacked' } }),
      record({ kind: PlanningSchemaKind.Type, key: PLOT.type, definition: { ...PLOT, label: 'Allotment' } }),
      record({ kind: PlanningSchemaKind.Type, key: GARDEN.type, definition: { ...BED, type: GARDEN.type } }),
    ]
    const view = scopedSchemaHelper.scopedRegistryOf(scopedSchemaHelper.resolveScopedBundle(code.bundle(), records, { entityId: 'org-1' }))

    expect(view.type(SHED.type).label).toBeUndefined()
    expect(view.type(PLOT.type).label).toBe('Allotment')
    expect(view.type(GARDEN.type).kind).toBe(WorkcardKind.Project)
    expect(() => scopedSchemaHelper.assertOverridable(code, PlanningSchemaKind.Type, SHED.type)).toThrow(SchemaSealed)
    expect(() => scopedSchemaHelper.assertOverridable(code, PlanningSchemaKind.Type, GARDEN.type)).toThrow(SchemaSealed)
    expect(() => scopedSchemaHelper.assertOverridable(code, PlanningSchemaKind.Flow, ROTA.id)).toThrow(SchemaSealed)
    expect(() => scopedSchemaHelper.assertOverridable(code, PlanningSchemaKind.Flow, SEASON.id)).not.toThrow()
  })

  test('a retired record gives way to a live one below it, and resolves retired when none is left', () => {
    const records = [
      record({ kind: PlanningSchemaKind.Type, key: PLOT.type, retired: true, definition: { ...PLOT, label: 'Old' } }),
      record({ kind: PlanningSchemaKind.Type, key: BED.type, retired: true, definition: BED }),
    ]
    const view = scopedSchemaHelper.scopedRegistryOf(scopedSchemaHelper.resolveScopedBundle(code.bundle(), records, { entityId: 'org-1' }))

    expect(view.type(PLOT.type).label).toBeUndefined()
    expect(view.isRetired(PlanningSchemaKind.Type, PLOT.type)).toBe(false)
    expect(view.type(BED.type).type).toBe(BED.type)
    expect(view.isRetired(PlanningSchemaKind.Type, BED.type)).toBe(true)
    expect(view.bundle().retired).toEqual({ types: [BED.type], flows: [] })
  })

  test('the view is read-only', () => {
    const view = scopedSchemaHelper.scopedRegistryOf(scopedSchemaHelper.resolveScopedBundle(code.bundle(), [], { entityId: 'org-1' }))

    expect(() => view.registerType(BED)).toThrow(PlanningUnsupported)
    expect(() => view.load(code.bundle())).toThrow(PlanningUnsupported)
    expect(view.primaryFlow(PLOT.type).id).toBe(SEASON.id)
  })

  test('a flow retired with no live fallback is in use while a live type runs it', () => {
    const flow: StatusFlowSchema = { ...ROTA, id: 'garden:watering' }
    const using: WorkcardTypeSchema = { ...BED, type: 'garden:hose', flows: [flow.id] }
    const retiredFlow = record({ kind: PlanningSchemaKind.Flow, key: flow.id, retired: true, definition: flow })
    const live = scopedSchemaHelper.resolveScopedBundle(code.bundle(), [
      retiredFlow, record({ kind: PlanningSchemaKind.Type, key: using.type, definition: using }),
    ], { entityId: 'org-1' })
    const idle = scopedSchemaHelper.resolveScopedBundle(code.bundle(), [
      retiredFlow, record({ kind: PlanningSchemaKind.Type, key: using.type, retired: true, definition: using }),
    ], { entityId: 'org-1' })

    expect(scopedSchemaHelper.flowInUse(live, flow.id)).toBe(using.type)
    expect(scopedSchemaHelper.flowInUse(idle, flow.id)).toBeUndefined()
  })
})

describe('scoped schemas — closed-form checks', () => {
  test('a flow needs unique statuses, declared targets and a from that is * or declared', () => {
    expect(() => scopedSchemaHelper.assertFlowSchema(SEASON)).not.toThrow()
    expect(() => scopedSchemaHelper.assertFlowSchema({ ...SEASON, statuses: [...SEASON.statuses, SEASON.statuses[0]] }))
      .toThrow('status-repeated:fallow')
    expect(() => scopedSchemaHelper.assertFlowSchema({ ...SEASON, transitions: [{ name: 'compost', from: '*', to: 'compost' }] }))
      .toThrow('compost:to:compost')
    expect(() => scopedSchemaHelper.assertFlowSchema({ ...SEASON, transitions: [{ name: 'sow', from: ['frozen'], to: 'growing' }] }))
      .toThrow('sow:from:frozen')
    expect(() => scopedSchemaHelper.assertFlowSchema({ ...SEASON, statuses: [] })).toThrow(SchemaInvalid)
  })

  test('a type must be a card with a compiling fields schema and unique flows that resolve', () => {
    expect(() => scopedSchemaHelper.assertTypeSchema(BED, code)).not.toThrow()
    expect(() => scopedSchemaHelper.assertTypeSchema({ ...BED, kind: WorkcardKind.Specification }, code)).toThrow('kind:specification')
    expect(() => scopedSchemaHelper.assertTypeSchema({ ...BED, fields: { type: 'nonsense' } }, code)).toThrow('fields:')
    expect(() => scopedSchemaHelper.assertTypeSchema({ ...BED, flows: [SEASON.id, SEASON.id] }, code)).toThrow('flow-repeated')
    expect(() => scopedSchemaHelper.assertTypeSchema({ ...BED, flows: ['garden:frost'] }, code)).toThrow('flow:garden:frost')
  })
})
