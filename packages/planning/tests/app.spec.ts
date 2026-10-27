import { describe, expect, test } from 'bun:test'
import { IntrinsicStatus, PlanningSchemaKind, PlanningUnsupported, SchemaInvalid, WorkcardKind } from '../src/index.js'
import type { PlanningAppDeclarations, ProjectTypeSchema, ScopedSchemaRecord, StatusFlowSchema, WorkcardTypeSchema } from '../src/index.js'
import { appSchemaHelper } from '../src/helpers/app.js'
import { scopedSchemaHelper } from '../src/helpers/scoped.js'
import { makeAjv, validateHelper } from '../src/helpers/validate.js'
import { makeSchemaRegistry } from '../src/registry.js'
import { PlanningSchemaBundleSchema, SchemaDefineRequestSchema } from '../src/schemas.js'

/** A repair shop: the app gives every type and flow a description and every job card a priority. */
const APP: PlanningAppDeclarations = {
  type: { properties: { description: { type: 'string', maxLength: 200 } } },
  flow: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] },
  card: { properties: { priority: { type: 'string', enum: ['low', 'high'] } } },
}

const MEND: StatusFlowSchema = {
  id: 'shop:mend', version: 1, overridable: true,
  statuses: [{ key: 'queued', intrinsic: IntrinsicStatus.Planned, initial: true }, { key: 'done', intrinsic: IntrinsicStatus.Closed }],
  transitions: [{ name: 'finish', from: ['queued'], to: 'done' }],
}

/** Closed fields, a local `$defs` reference — the shape a base field must not break. */
const JOB: WorkcardTypeSchema = {
  type: 'shop:job', kind: WorkcardKind.Card, version: 1, flows: [MEND.id], specifications: [],
  fields: {
    type: 'object',
    properties: { cost: { $ref: '#/$defs/money' } },
    additionalProperties: false,
    $defs: { money: { type: 'number', minimum: 0 } },
  },
}

const SHOP: ProjectTypeSchema = {
  type: 'shop:site', kind: WorkcardKind.Project, version: 1, fields: { type: 'object', additionalProperties: false },
  flows: [MEND.id], specifications: [], cardTypes: [JOB.type], scopedCardTypes: true,
}

describe('appSchemaHelper — declarations', () => {
  test('merges in the order given: properties united, a later name replacing whole, required united', () => {
    const merged = appSchemaHelper.merge([
      undefined,
      { card: { properties: { priority: { type: 'string' }, size: { type: 'number' } }, required: ['size'] } },
      { card: { properties: { priority: { type: 'string', enum: ['low'] } }, required: ['priority'] }, type: { properties: {} } },
    ])
    expect(merged).toEqual({
      card: {
        type: 'object',
        properties: { priority: { type: 'string', enum: ['low'] }, size: { type: 'number' } },
        required: ['size', 'priority'],
      },
      type: { type: 'object', properties: {} },
    })
    expect(appSchemaHelper.merge([])).toBeUndefined()
    expect(appSchemaHelper.merge([undefined, {}])).toBeUndefined()
  })

  test('refuses a declaration a merge by name could not honour', () => {
    const refused = (app: unknown, marker: string) =>
      expect(() => appSchemaHelper.assertDeclarations(app as PlanningAppDeclarations)).toThrow(marker)
    refused({ status: { properties: {} } }, 'app:kind:status')
    refused({ card: { properties: {}, additionalProperties: false } }, 'app:card:keyword:additionalProperties')
    refused({ type: { type: 'string', properties: {} } }, 'app:type:type')
    refused({ flow: { properties: [] } }, 'app:flow:properties')
    refused({ card: { properties: { 'a.b': {} } } }, 'app:card:name:a.b')
    refused({ card: { properties: { $x: {} } } }, 'app:card:name:$x')
    refused({ type: { properties: { a: {} }, required: ['b'] } }, 'app:type:required:b')
    refused({ type: { properties: { a: { type: 'nope' } } } }, 'app:type:')
    expect(() => appSchemaHelper.merge([{ card: { properties: {}, allOf: [] } as never }])).toThrow(SchemaInvalid)
    expect(() => appSchemaHelper.assertDeclarations(APP)).not.toThrow()
  })
})

describe('appSchemaHelper — definition bags', () => {
  test('a bag is closed over the declared kind, and refused when the kind is undeclared', () => {
    const ok = (kind: PlanningSchemaKind.Type | PlanningSchemaKind.Flow, bag: unknown, app = APP) =>
      appSchemaHelper.assertBag(kind, 'k', bag, app)

    expect(() => ok(PlanningSchemaKind.Type, { description: 'Jobs at the counter' })).not.toThrow()
    expect(() => ok(PlanningSchemaKind.Type, undefined)).not.toThrow()
    expect(() => ok(PlanningSchemaKind.Type, { colour: 'red' })).toThrow('type:k:app:')
    expect(() => ok(PlanningSchemaKind.Type, { description: 5 })).toThrow(SchemaInvalid)
    expect(() => ok(PlanningSchemaKind.Type, { description: 'x', nested: { 'a.b': 1 } })).toThrow('type:k:app:keys:nested.a.b')
    // A required property makes the bag itself mandatory.
    expect(() => ok(PlanningSchemaKind.Flow, undefined)).toThrow("flow:k:app:/ must have required property 'description'")
    expect(() => ok(PlanningSchemaKind.Flow, { description: 'Bench work' })).not.toThrow()
    expect(() => ok(PlanningSchemaKind.Flow, { description: 'x' }, { card: APP.card })).toThrow('flow:k:app:undeclared')
    expect(() => ok(PlanningSchemaKind.Flow, undefined, {})).not.toThrow()
    expect(appSchemaHelper.bagSchemaOf(APP, PlanningSchemaKind.Type)).toEqual({
      type: 'object', properties: { description: { type: 'string', maxLength: 200 } }, additionalProperties: false,
    })
    expect(appSchemaHelper.bagSchemaOf({}, PlanningSchemaKind.Flow)).toBeUndefined()
  })

  test('the declaration schemas admit an app bag on the wire and in a bundle', () => {
    const define = makeAjv().compile(SchemaDefineRequestSchema)
    const bundle = makeAjv().compile(PlanningSchemaBundleSchema)

    expect(define({ types: [{ ...JOB, app: { description: 'x' } }], flows: [{ ...MEND, app: { description: 'y' } }] })).toBe(true)
    expect(define({ types: [{ ...JOB, app: 'x' }] })).toBe(false)
    expect(bundle({ version: 1, types: [JOB], flows: [MEND], app: APP })).toBe(true)
    expect(bundle({ version: 1, types: [JOB], flows: [MEND], app: { status: {} } })).toBe(false)
  })
})

describe('appSchemaHelper — base card fields', () => {
  test('a card type validates its own fields and the base ones; closed fields never refuse a base field', () => {
    const registry = makeSchemaRegistry({ flows: [MEND], types: [JOB, SHOP], app: APP })
    const valid = (fields: Record<string, unknown>) => registry.validator(JOB.type)(fields)

    expect(valid({ cost: 12, priority: 'high' })).toBe(true)
    expect(valid({ cost: 12 })).toBe(true)
    expect(valid({ cost: -1, priority: 'high' })).toBe(false)
    expect(valid({ cost: 1, priority: 'urgent' })).toBe(false)
    expect(valid({ cost: 1, colour: 'red' })).toBe(false)
    expect(() => validateHelper.validateFields(registry, JOB.type, { priority: 'urgent' })).toThrow('shop:job:')
    // A project type is not a card type: its closed fields stay closed.
    expect(registry.validator(SHOP.type)({ priority: 'high' })).toBe(false)
    expect(registry.fieldsSchema(SHOP.type)).toBe(SHOP.fields)
  })

  test('a type may narrow a base field, and a required base field is required of every card type', () => {
    const narrow: WorkcardTypeSchema = { ...JOB, type: 'shop:rush', fields: { type: 'object', properties: { priority: { const: 'high' } } } }
    const registry = makeSchemaRegistry({
      flows: [MEND], types: [narrow],
      app: { card: { properties: { priority: { type: 'string', enum: ['low', 'high'] } }, required: ['priority'] } },
    })

    expect(registry.validator(narrow.type)({ priority: 'high' })).toBe(true)
    expect(registry.validator(narrow.type)({ priority: 'low' })).toBe(false)
    expect(registry.validator(narrow.type)({})).toBe(false)
  })

  test('without base fields the type\'s own fields object is what compiles', () => {
    expect(appSchemaHelper.fieldsSchemaOf(JOB)).toBe(JOB.fields)
    expect(appSchemaHelper.fieldsSchemaOf(JOB, { type: APP.type })).toBe(JOB.fields)
    expect(makeSchemaRegistry({ flows: [MEND], types: [JOB] }).fieldsSchema(JOB.type)).toBe(JOB.fields)
  })
})

describe('the schema registry and the scoped layers carry the declarations', () => {
  test('registerApp replaces them and drops the cached validators; a bundle names them only when present', () => {
    const registry = makeSchemaRegistry({ flows: [MEND], types: [JOB] })
    expect('app' in registry.bundle()).toBe(false)
    expect(registry.validator(JOB.type)({ priority: 'high' })).toBe(false)

    registry.registerApp(APP)
    expect(registry.app()).toEqual(APP)
    expect(registry.bundle().app).toEqual(APP)
    expect(registry.validator(JOB.type)({ priority: 'high' })).toBe(true)

    registry.load({ version: 1, types: [JOB], flows: [MEND] })
    expect(registry.app()).toBeUndefined()
    expect(registry.validator(JOB.type)({ priority: 'high' })).toBe(false)
    registry.load({ version: 1, types: [JOB], flows: [MEND], app: APP })
    expect(registry.validator(JOB.type)({ priority: 'high' })).toBe(true)
    expect(() => registry.registerApp({ card: { properties: { 'a.b': {} } } })).toThrow(SchemaInvalid)
  })

  test('a resolved layer passes the code declarations through; its registry refuses registerApp', () => {
    const code = makeSchemaRegistry({ flows: [MEND], types: [JOB, SHOP], app: APP })
    const record: ScopedSchemaRecord = {
      entityId: 'org-1', kind: PlanningSchemaKind.Type, key: 'shop:quote', version: 1, createdAt: '2026-10-01T00:00:00.000Z',
      definition: { ...JOB, type: 'shop:quote', fields: { type: 'object', additionalProperties: false }, app: { description: 'Quotes' } },
    }
    const layer = scopedSchemaHelper.scopedRegistryOf(scopedSchemaHelper.resolveScopedBundle(code.bundle(), [record], { entityId: 'org-1' }))

    expect(layer.bundle().app).toEqual(APP)
    expect((layer.type('shop:quote') as WorkcardTypeSchema).app).toEqual({ description: 'Quotes' })
    expect(layer.validator('shop:quote')({ priority: 'low' })).toBe(true)
    expect(() => layer.registerApp(undefined)).toThrow(PlanningUnsupported)
    const plain = scopedSchemaHelper.resolveScopedBundle(makeSchemaRegistry({ flows: [MEND], types: [JOB] }).bundle(), [], { entityId: 'org-1' })
    expect('app' in plain).toBe(false)
  })

  test('the closed-form checks of a data-defined type and flow apply the declarations', () => {
    const flows = makeSchemaRegistry({ flows: [MEND] })
    const quote: WorkcardTypeSchema = { ...JOB, type: 'shop:quote' }

    expect(() => scopedSchemaHelper.assertTypeSchema({ ...quote, app: { description: 'Quotes' } }, flows, APP)).not.toThrow()
    expect(() => scopedSchemaHelper.assertTypeSchema({ ...quote, app: { owner: 'me' } }, flows, APP)).toThrow('type:shop:quote:app:')
    expect(() => scopedSchemaHelper.assertTypeSchema({ ...quote, app: { description: 'Quotes' } }, flows)).toThrow('type:shop:quote:app:undeclared')
    expect(() => scopedSchemaHelper.assertTypeSchema(quote, flows)).not.toThrow()
    expect(() => scopedSchemaHelper.assertFlowSchema({ ...MEND, app: { description: 'Bench' } }, APP)).not.toThrow()
    expect(() => scopedSchemaHelper.assertFlowSchema(MEND, APP)).toThrow('flow:shop:mend:app:')
    expect(() => scopedSchemaHelper.assertFlowSchema(MEND)).not.toThrow()
  })
})
