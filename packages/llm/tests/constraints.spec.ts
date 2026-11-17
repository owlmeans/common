import { describe, expect, test } from 'bun:test'
import { compatiblePlugin, openAiPlugin } from '../src/index.js'

/**
 * OpenAI's non-strict `json_schema` shows the model a schema WITHOUT its validation keywords, so the
 * OpenAI family sends a copy that states them in each node's `description`. Offline: the response
 * format is read straight from the plugins.
 */

interface Node { description?: string, properties: Record<string, Node>, items: Node, enum: unknown[], const: unknown, default: unknown, anyOf: Node[] }

const shownOf = (schema: unknown, plugin = openAiPlugin): Node =>
  (plugin.responseFormat!('plan', schema).json_schema as { schema: Node }).schema

const callerSchema = () => ({
  type: 'object',
  properties: {
    title: { type: 'string', description: 'The title.', minLength: 3, maxLength: 80 },
    code: { type: 'string', pattern: '^[a-z]+$', format: 'hostname' },
    tags: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 5 },
    score: { type: 'number', minimum: 0, maximum: 10 },
    interaction: {
      type: 'object', nullable: true,
      properties: { entity: { type: 'string' }, note: { type: 'string' } },
      required: ['entity'],
    },
    kind: { type: 'string', enum: ['a', 'b'], default: 'a' },
  },
  required: ['title', 'interaction'],
})

describe('@owlmeans/llm — the constraints a non-strict json_schema hides, stated in descriptions', () => {
  test('a required property, a nullable node and every stripped constraint reach the description', () => {
    const shown = shownOf(callerSchema())

    expect(shown.properties.title!.description).toBe('The title. Required. At least 3 character(s). At most 80 character(s).')
    expect(shown.properties.interaction!.description).toBe('Required. May be null.')
    expect(shown.properties.interaction!.properties.entity!.description).toBe('Required.')
    expect(shown.properties.interaction!.properties.note!.description).toBeUndefined()
    expect(shown.properties.code!.description).toBe('Must match the pattern ^[a-z]+$. Format: hostname.')
    expect(shown.properties.tags!.description).toBe('At least 1 item(s). At most 5 item(s).')
    expect(shown.properties.tags!.items.description).toBe('At least 1 character(s).')
    expect(shown.properties.score!.description).toBe('At least 0. At most 10.')
    expect(shown.properties.kind!.description).toBeUndefined()
    // The keywords themselves still go out: a provider that honours them loses nothing.
    expect((shown as unknown as { required: string[] }).required).toEqual(['title', 'interaction'])
    expect((shown.properties.title as unknown as { minLength: number }).minLength).toBe(3)
  })

  test('the caller\'s schema is never edited, and the copy shares no node with it', () => {
    const caller = callerSchema()
    const before = JSON.stringify(caller)
    const shown = shownOf(caller)

    expect(JSON.stringify(caller)).toBe(before)
    shown.properties.kind!.enum.push('c')
    expect(caller.properties.kind.enum).toEqual(['a', 'b'])
  })

  test('values are never walked as schemas: const, default and enum stay as written', () => {
    const shown = shownOf({
      type: 'object',
      properties: {
        fixed: { const: { minLength: 5 }, default: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } },
      },
    })

    expect(shown.properties.fixed!.const).toEqual({ minLength: 5 })
    expect(shown.properties.fixed!.default).toEqual({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] })
    expect(shown.properties.fixed!.description).toBeUndefined()
  })

  test('a schema with nothing hidden goes out as written; anyOf branches and the compatible plugin fold too', () => {
    expect(openAiPlugin.responseFormat!('extract', { type: 'object' })).toEqual({
      type: 'json_schema', json_schema: { name: 'extract', schema: { type: 'object' }, strict: false },
    })
    const shown = shownOf({
      anyOf: [{ type: 'object', properties: { a: { type: 'string', maxLength: 2 } }, required: ['a'] }, { type: 'null' }],
    }, compatiblePlugin)

    expect(shown.anyOf[0]!.properties.a!.description).toBe('Required. At most 2 character(s).')
    expect(shown.anyOf[1]).toEqual({ type: 'null' })
  })
})
