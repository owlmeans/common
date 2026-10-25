import { describe, expect, test } from 'bun:test'
import { IntrinsicStatus } from '@owlmeans/planning'
import {
  CONVERSION_DIR, CONVERSION_DOCS, CONVERSION_TYPES_FILE, OriginDefinition, OriginFieldSchema, originTypesHelper,
} from '../src/convert/index.js'

const CARD_TYPE = {
  name: 'CardType', entity: 'card-type', label: 'card type', definition: OriginDefinition.CardType,
  attributes: [
    { name: 'name', type: 'string', required: true },
    { name: 'icon', type: 'string', required: false, default: 'circle' },
    { name: 'fields', type: 'CardTypeField', required: true, list: true },
    { name: 'kind', type: 'string', required: true, closed: ['text', 'number'] },
  ],
  relations: [],
}

const DEFINITIONS = {
  type: {
    origin: 'CardType', fieldKinds: [{ origin: 'checkbox', schema: OriginFieldSchema.Boolean }],
    requiredFields: true, icon: true, tone: true, properties: ['description'],
  },
  flow: {
    origin: 'Workflow', categories: [{ origin: 'done', intrinsic: IntrinsicStatus.Closed }],
    statusTones: true, initial: true, transitions: true, icon: false, tone: false, properties: [],
  },
  container: { origin: 'Project', label: 'Project', projectFlows: true },
  card: { origin: 'Card', fields: ['priority'], linked: true, numbered: true },
}

describe('viable-common - the origin types document', () => {
  test('is a fixed conversion document under the conversion directory', () => {
    expect(CONVERSION_TYPES_FILE).toBe(`${CONVERSION_DIR}/types.md`)
    expect(CONVERSION_DOCS).toContain(CONVERSION_TYPES_FILE)
  })

  test('reads a record back, the proofs re-attached from the origin list', () => {
    const record = originTypesHelper.recordOf({
      types: [CARD_TYPE],
      definitions: DEFINITIONS,
      origin: [{ type: 'CardType', path: 'src/schemas/card-type.ts', symbol: 'CardTypeSchema', lines: [3, 20], note: 'zod schema' }],
    })

    expect(record?.types).toHaveLength(1)
    expect(record?.types[0]).toEqual({
      ...CARD_TYPE,
      proofs: [{ path: 'src/schemas/card-type.ts', symbol: 'CardTypeSchema', lines: [3, 20], note: 'zod schema' }],
    })
    expect(record?.definitions).toEqual(DEFINITIONS)
  })

  test('drops a malformed type alone and reads malformed definitions as none', () => {
    const record = originTypesHelper.recordOf({
      types: [CARD_TYPE, { name: '', attributes: [], relations: [] }, { name: 'Card' }, 'text'],
      definitions: { type: { origin: 7 } },
    })

    expect(record?.types.map(type => type.name)).toEqual(['CardType'])
    expect(record?.definitions).toBeNull()
  })

  test('answers null for anything that is not a types record', () => {
    expect(originTypesHelper.recordOf(null)).toBeNull()
    expect(originTypesHelper.recordOf({})).toBeNull()
    expect(originTypesHelper.recordOf({ types: 'CardType' })).toBeNull()
    expect(originTypesHelper.definitionsOf(undefined)).toBeNull()
  })

  test('keeps only known schemas, intrinsic states and definition kinds', () => {
    const facts = originTypesHelper.definitionsOf({
      type: { ...DEFINITIONS.type, fieldKinds: [{ origin: 'text', schema: 'string' }, { origin: 'rich', schema: 'html' }] },
      flow: { ...DEFINITIONS.flow, categories: [{ origin: 'todo', intrinsic: 'planned' }, { origin: 'odd', intrinsic: 'nowhere' }] },
      container: null,
    })

    expect(facts?.type?.fieldKinds).toEqual([{ origin: 'text', schema: OriginFieldSchema.String }])
    expect(facts?.flow?.categories).toEqual([{ origin: 'todo', intrinsic: IntrinsicStatus.Planned }])
    expect(facts?.container).toBeNull()
    expect(facts?.card).toBeNull()
    expect(originTypesHelper.recordOf({ types: [{ ...CARD_TYPE, definition: 'board' }] })?.types[0]?.definition).toBeUndefined()
  })

  test('files a name under its kebab-case key', () => {
    expect(originTypesHelper.entityOf('CardType')).toBe('card-type')
    expect(originTypesHelper.entityOf('card_type')).toBe('card-type')
    expect(originTypesHelper.entityOf('Card type')).toBe('card-type')
    expect(originTypesHelper.entityOf('HTTPRoute')).toBe('http-route')
  })
})
