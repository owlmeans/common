import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSON_SCHEMA_DRAFT_07 } from '../src/validation/consts.js'

describe('@owlmeans/client-planning — the draft-07 meta-schema', () => {
  test('is ajv\'s own refs file, kept as data rather than imported as JSON', () => {
    const file = createRequire(import.meta.url).resolve('ajv/dist/refs/json-schema-draft-07.json')

    expect(JSON_SCHEMA_DRAFT_07).toEqual(JSON.parse(readFileSync(file, 'utf8')))
    expect(readFileSync(new URL('../src/validation.ts', import.meta.url), 'utf8')).not.toContain('.json\'')
  })
})
