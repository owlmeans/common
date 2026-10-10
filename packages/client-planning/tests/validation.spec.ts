import { describe, expect, test } from 'bun:test'
import type { AnySchema } from 'ajv'
import { makeAjv, SchemaInvalid } from '@owlmeans/planning'
import { makePlanningFieldValidator } from '../src/index.js'

describe('@owlmeans/client-planning — CSP field validation', () => {
  test('the exact nested fields validate without modifying, coercing, flattening or defaulting them', () => {
    const schema = { type: 'object', properties: {
      estimatedValue: { type: 'object', properties: { amount: { type: 'number', minimum: 0 }, currency: { type: 'string', enum: ['USD', 'EUR'] } },
        required: ['amount', 'currency'], additionalProperties: false },
      nextContactDate: { type: 'string', format: 'date' }, priority: { type: 'string', enum: ['low', 'normal', 'high'] },
    }, required: ['estimatedValue', 'nextContactDate'], additionalProperties: false }
    const copy = structuredClone(schema)
    const validator = makePlanningFieldValidator(schema)
    const valid = { estimatedValue: { amount: 12345, currency: 'USD' }, nextContactDate: '2027-03-15', priority: 'normal' }
    const payload = structuredClone(valid)
    expect(validator.validateFields(valid)).toEqual({ valid: true, errors: [] })
    expect(validator.validateFields({ estimatedValue: valid.estimatedValue, nextContactDate: valid.nextContactDate }).valid).toBe(true)
    const invalid = [ {}, { ...valid, estimatedValue: 12345 }, { ...valid, estimatedValue: { amount: 2 } },
      { ...valid, estimatedValue: { amount: '12345', currency: 'USD' } }, { ...valid, estimatedValue: { amount: -1, currency: 'USD' } },
      { ...valid, priority: 'urgent' }, { ...valid, nextContactDate: '2027-02-30' },
      { ...valid, nextContactDate: '2027-03-15T00:00:00Z' }, { ...valid, extra: true } ]
    const native = makeAjv().compile(schema)
    for (const fields of invalid) {
      const checked = validator.validateFields(fields)
      expect(checked.valid).toBe(native(fields) === true)
      expect(checked.valid).toBe(false)
      expect(checked.errors.length).toBeGreaterThan(0)
      expect(checked.errors.every(error => error.message.length < 100)).toBe(true)
    }
    expect(validator.validateFields({ ...valid, estimatedValue: { amount: 2 } }).errors).toContainEqual({
      path: 'estimatedValue.currency', keyword: 'required', schemaPath: '#/properties/estimatedValue/required', message: 'A required field is missing',
    })
    expect(schema).toEqual(copy)
    expect(valid).toEqual(payload)
  })

  test('supported Draft 7 predicates agree with native planning AJV, including references, compositions and full formats', () => {
    const cases: Array<{ schema: AnySchema, values: unknown[] }> = [
      { schema: { type: ['number', 'null'], minimum: 0, maximum: 7, exclusiveMinimum: -1, exclusiveMaximum: 8 }, values: [null, 0, 7, -1, 8, '3'] },
      { schema: { type: 'integer', minimum: -3, maximum: 3 }, values: [-3, 0, 3, 1.99999999, 6.00000001, 4] },
      { schema: { type: 'string', minLength: 2, maxLength: 3, pattern: '^.+' }, values: ['ab', 'a😀', '😀', 'abcd', '', 2] },
      { schema: { type: 'array', items: [{ type: 'string' }, { type: 'integer' }], additionalItems: false }, values: [[], ['a'], ['a', 2], ['a', '2'], ['a', 2, 3]] },
      { schema: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 3, uniqueItems: true, contains: { const: 2 } }, values: [[1, 2], [2], [], [1], [2, 2], [1, 2, 3, 4], ['2']] },
      { schema: { type: 'object', patternProperties: { '^a': { type: 'number' } }, additionalProperties: false, minProperties: 1, maxProperties: 2 },
        values: [{ abc: 1 }, { abc: '1' }, {}, { abc: 1, other: 2 }, { a: 1, ab: 2, abc: 3 }] },
      { schema: { type: 'object', propertyNames: { pattern: '^[a-z]+$' }, dependencies: { a: ['b'], c: { required: ['d'] } } },
        values: [{}, { a: 1, b: 2 }, { a: 1 }, { c: 1 }, { c: 1, d: 2 }, { A: 1 }] },
      { schema: { allOf: [{ type: 'number' }, { minimum: 2 }], not: { const: 3 } }, values: [2, 4, 1, 3, '2'] },
      { schema: { anyOf: [{ type: 'string', pattern: '^a' }, { type: 'integer' }] }, values: ['abc', 2, 'xyz', 1.5, null] },
      { schema: { oneOf: [{ type: 'number', minimum: 1 }, { type: 'number', maximum: 3 }] }, values: [0, 4, 2, '2'] },
      { schema: { if: { type: 'string' }, then: { minLength: 2 }, else: { type: 'integer' } }, values: ['ab', 2, 'a', 1.5, null] },
      { schema: { $defs: { n: { type: 'number' } }, $ref: '#/$defs/n', minimum: 5 }, values: [7, 3, '7'] },
      { schema: { $id: 'https://planning.test/fields', definitions: { n: { $id: 'number', type: 'number' } }, properties: { a: { $ref: 'number' } } },
        values: [{ a: 2 }, { a: '2' }, {}] },
      { schema: { definitions: { blocked: false }, properties: { a: { $ref: '#/definitions/blocked' } } }, values: [{}, { a: 1 }] },
      { schema: { type: 'object', properties: { value: { type: 'number' }, next: { $ref: '#' } }, required: ['value'] },
        values: [{ value: 1 }, { value: 1, next: { value: 2 } }, { value: 1, next: {} }] },
      { schema: { type: 'object', properties: { a: { type: 'number', default: 7 } }, required: ['a'] }, values: [{}, { a: 3 }, { a: '3' }] },
      { schema: { type: 'object', properties: { a: { type: 'string', nullable: true, minLength: 2, format: 'email' } } },
        values: [{}, { a: null }, { a: 'a@example.test' }, { a: 'a' }, { a: 3 }] },
      { schema: { type: 'string', nullable: true, enum: ['a'] }, values: ['a', null, 'b'] },
      { schema: { type: 'string', nullable: true, const: 'a' }, values: ['a', null, 'b'] },
      { schema: { type: ['string', 'null'], nullable: true }, values: ['a', null, 3] },
      { schema: { type: 'string', nullable: false }, values: ['a', null, 3] },
      { schema: true, values: [1, 'a', null] }, { schema: false, values: [1, 'a', null] },
    ]
    const formats = [
      ['date', ['2024-02-29', '2027-03-15', '2027-02-29', '2027-04-31', '2027-03-15T00:00:00Z']],
      ['time', ['12:00:00Z', '23:59:60Z', '12:00:00', '12:00:00+99:00', '25:00:00Z']],
      ['date-time', ['2027-03-15T12:00:00Z', '2027-03-15 12:00:00Z', '2027-02-30T12:00:00Z', '2027-03-15T12:00:00+99:00']],
      ['email', ['a@example.test', 'a@localhost', '.a@example.test', 'a..b@example.test']],
      ['ipv4', ['127.0.0.1', '01.2.3.4', '256.0.0.1']], ['uuid', ['123e4567-e89b-12d3-a456-426614174000', 'bad']],
      ['uri', ['https://planning.test/a', 'urn:planning:test', '/relative']],
      ['iso-time', ['12:00:00', '12:00:00Z', '25:00:00']], ['duration', ['P1D', 'P1W', 'P', 'P1.5D']],
    ] as const
    for (const [name, values] of formats) cases.push({ schema: { type: 'string', format: name }, values: [...values] })
    for (const { schema, values } of cases) {
      const native = makeAjv().compile(schema)
      const client = makePlanningFieldValidator(schema)
      for (const value of values) {
        // Untyped JSON can reach a validator with the wrong root kind; it must still refuse it.
        expect(client.validateFields(value as Record<string, unknown>).valid).toBe(native(value) === true)
      }
    }
  })

  test('malformed, unresolved and unsupported schemas fail closed at preparation, including dormant branches', () => {
    const schemas: AnySchema[] = [
      { properties: { optional: { $ref: 'https://missing.test/private?credential=never-print' } } },
      { if: false, then: { $ref: '#/definitions/missing' } }, { $ref: '#' },
      { $schema: 'https://json-schema.org/draft/2020-12/schema' }, { type: 'number', multipleOf: 0.1 },
      { type: 'integer', multipleOf: 2 }, { type: 'integer', multipleOf: 1 },
      { nullable: true }, { type: 'string', nullable: 'true' }, { type: ['string', 'null'], nullable: false },
      { type: 'string', format: 'made-up' }, { type: 'number', format: 'int32' },
      { type: 'string', format: 'date', formatMinimum: '2027-01-01' }, { unevaluatedProperties: false },
      { required: 'field' }, { type: 'object', properties: { a: { minLength: -1 } } },
      { $defs: { invalid: { type: 'invented' } } }, { $defs: null }, { $defs: [] }, { pattern: '[' }, { enum: [] },
    ]
    for (const schema of schemas) expect(() => makePlanningFieldValidator(schema)).toThrow(SchemaInvalid)
    try { makePlanningFieldValidator(schemas[0]!) } catch (error) {
      expect(String(error)).toContain('missing-reference:#/properties/optional/$ref')
      expect(String(error)).not.toContain('credential')
      expect(String(error)).not.toContain('https://missing')
    }
    const schema = { type: 'object', properties: { a: { type: 'number' } }, 'x-nativekit': { source: 'preserved' } }
    expect(makePlanningFieldValidator(schema).validateFields({ a: 3 }).valid).toBe(true)
    expect(schema['x-nativekit']).toEqual({ source: 'preserved' })
  })

  test('unsafe keys and non-JSON values refuse with bounded field errors, while required names decode correctly', () => {
    const validate = makePlanningFieldValidator({ type: 'object', properties: { nested: { type: 'object', required: ['a/b~c'] } } }).validateFields
    expect(validate({ nested: {} }).errors[0]?.path).toBe('nested.a/b~c')
    for (const value of [NaN, Infinity, undefined, 2n, new Date(), () => 3]) expect(validate({ nested: { value } }).valid).toBe(false)
    expect(validate({ nested: { 'unsafe.key': 3 } }).errors.some(error => error.keyword === 'field-key')).toBe(true)
    const cycle: Record<string, unknown> = {}; cycle.self = cycle
    expect(validate(cycle).valid).toBe(false)
    const longKey = 'field'.repeat(200)
    const unsafe = validate({ [longKey]: undefined, [`${longKey}.nested`]: 3 })
    expect(unsafe.valid).toBe(false)
    expect(unsafe.errors).toHaveLength(2)
    expect(unsafe.errors.every(error => error.path.length <= 512)).toBe(true)
    const errors = makePlanningFieldValidator({ type: 'object', required: Array.from({ length: 100 }, (_, index) => `field${index}`) }).validateFields({})
    expect(errors.valid).toBe(false)
    expect(errors.errors).toHaveLength(64)
  })
})
