import { describe, expect, test } from 'bun:test'
import * as schemas from '../src/schemas.js'
import { TransitionAction, WorkcardKind } from '../src/consts.js'
import { makeAjv, validateCard } from '../src/helpers/validate.js'
import { applyTransition } from '../src/helpers/apply.js'
import { computeChanges } from '../src/helpers/changes.js'
import { FieldsInvalid } from '../src/errors.js'
import { AT, STORY_TYPE, makeRegistry, transitionOf } from './fixtures.js'

type Node = Record<string, unknown>

/** Every fault of the two `$jsonSchema` rules, as `path: reason`. */
const faultsOf = (node: unknown, path: string): string[] => {
  if (node == null || typeof node !== 'object') {
    return []
  }
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => faultsOf(entry, `${path}[${index}]`))
  }
  const schema = node as Node
  const faults: string[] = []
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  if (types.includes('integer')) {
    faults.push(`${path}: integer`)
  }
  if (schema.properties != null && typeof schema.properties === 'object') {
    const required = new Set((schema.required as string[] | undefined) ?? [])
    for (const [key, property] of Object.entries(schema.properties as Record<string, Node>)) {
      if (!required.has(key) && property.nullable !== true) {
        faults.push(`${path}.${key}: optional but not nullable`)
      }
    }
  }
  for (const [key, value] of Object.entries(schema)) {
    if (key !== 'enum' && key !== 'required') {
      faults.push(...faultsOf(value, `${path}.${key}`))
    }
  }

  return faults
}

describe('schemas', () => {
  const exported = Object.entries(schemas).filter(([name]) => name.endsWith('Schema'))

  test('no exported schema uses integer, and every optional property is nullable', () => {
    expect(exported.length).toBeGreaterThan(40)
    expect(exported.flatMap(([name, schema]) => faultsOf(schema, name))).toEqual([])
  })

  test('every exported schema compiles, and a folded record validates against its own schema', () => {
    const ajv = makeAjv()
    exported.forEach(([, schema]) => ajv.compile(schema as object))

    const registry = makeRegistry()
    const { changes } = computeChanges(undefined, {
      action: TransitionAction.Create,
      card: { kind: WorkcardKind.Card, type: STORY_TYPE.type, title: 'Story', fields: { area: 'user', primary: true } },
    }, STORY_TYPE, registry, AT)
    const card = applyTransition(undefined, transitionOf({ card: 'c1', seq: 1, action: TransitionAction.Create, changes }))!

    expect(() => validateCard(card, registry)).not.toThrow()
    expect(() => validateCard({ ...card, fields: { area: 'moon', primary: true } }, registry)).toThrow(FieldsInvalid)
    expect(() => validateCard({ ...card, fields: { 'a.b': 1 } }, registry)).toThrow('keys:a.b')
  })

  test('an execute request accepts a card id or a create draft, and refuses an unknown action', () => {
    const validate = makeAjv().compile(schemas.ExecuteRequestSchema)

    expect(validate({ card: 'c1', action: 'transit', transition: 'start', expectSeq: null, wait: true })).toBe(true)
    expect(validate({ card: { kind: 'card', type: 'test:story', title: 'Story' }, action: 'create' })).toBe(true)
    expect(validate({ card: 'c1', action: 'explode' })).toBe(false)
  })
})
