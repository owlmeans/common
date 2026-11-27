import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { makeSchemaRegistry } from '@owlmeans/planning'
import * as barrel from '../src/index.js'
import { ProjectArea } from '../src/areas/consts.js'
import { CatalogueChoiceSchema } from '../src/stack/choice/schemas.js'
import {
  VIABLE_BLUEPRINT_SOURCES, VIABLE_FLOW_SCHEMAS, VIABLE_PROJECT_TYPE, VIABLE_TYPE_SCHEMAS, ViableProjectFieldsSchema,
} from '../src/planning/index.js'
import { projectStructureHelper as structureHelper } from '../src/topology/structure.js'
import { StructureIssueCode, StructurePartKind as Kind } from '../src/topology/structure/consts.js'
import {
  ProjectStructureSchema, StructureIssueSchema, StructurePartSchema, StructureRefSchema, ViableStructureDecisionSchema,
} from '../src/topology/structure/schemas.js'
import type { ProjectStructure } from '../src/topology/structure/types.js'

/**
 * The structure's records are stored on the project card, in a preliminary record and on the wire. A
 * card written before them must validate as it did, `null` must pass where a key is optional, a key
 * nobody declared is refused — and nothing in them may carry a keyword the browser's planning
 * validator refuses (`multipleOf`, `format`) or a stored-record schema may not (`integer`).
 * Compiled the way the planning registry compiles them (no formats, not strict).
 */
const ajv = new Ajv({ allErrors: true, strict: false })
const at = '2026-11-24T10:00:00.000Z'

const custom = (): ProjectStructure => {
  const base = structureHelper.defaultFor([ProjectArea.User, ProjectArea.Admin])

  return {
    areas: base.areas,
    parts: [
      ...base.parts,
      { name: 'dates', kind: Kind.Library, dependsOn: ['common'], purpose: 'Date and time helpers.' },
      { name: 'mailer', kind: Kind.Worker, dependsOn: ['common', 'backend'], queues: ['mail'], purpose: 'Sends the mail.' },
    ],
  }
}

/** Every keyword name used anywhere in a schema tree. */
const keywordsOf = (node: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(node)) node.forEach(item => keywordsOf(item, out))
  else if (node != null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'properties') out.add(key)
      if (key === 'properties' && value != null && typeof value === 'object') Object.values(value).forEach(child => keywordsOf(child, out))
      else keywordsOf(value, out)
    }
  }

  return out
}

describe('viable-common - the structure schemas', () => {
  test('a structure, its ref and its decision validate; a stray key, a bad kind or a missing purpose are refused', () => {
    const structure = ajv.compile(ProjectStructureSchema)
    const ref = ajv.compile(StructureRefSchema)
    const decision = ajv.compile(ViableStructureDecisionSchema)
    expect(structure(custom())).toBe(true)
    expect(structure(structureHelper.defaultFor([]))).toBe(true)
    expect(ref(structureHelper.refOf(custom()))).toBe(true)
    expect(ref(custom())).toBe(false)
    expect(decision({ ...custom(), by: 'person', at })).toBe(true)
    expect(decision({ ...custom(), by: 'person', quote: null, at })).toBe(true)
    expect(decision({ ...custom(), by: 'owner', at })).toBe(false)
    expect(decision({ ...custom(), by: 'person' })).toBe(false)
    expect(structure({ ...custom(), extra: 1 })).toBe(false)
    expect(structure({ ...custom(), parts: [] })).toBe(false)

    const part = ajv.compile(StructurePartSchema)
    const ok = { name: 'dates', kind: Kind.Library, dependsOn: ['common'], purpose: 'Dates.' }
    expect(part(ok)).toBe(true)
    expect(part({ ...ok, mount: null, index: null, areas: null, queues: null })).toBe(true)
    expect(part({ ...ok, kind: 'module' })).toBe(false)
    expect(part({ ...ok, purpose: '' })).toBe(false)
    expect(part({ ...ok, purpose: ' padded' })).toBe(false)
    expect(part({ ...ok, purpose: 'x'.repeat(401) })).toBe(false)
    expect(part({ ...ok, name: 'Dates' })).toBe(false)
    expect(part({ ...ok, dependsOn: ['common', 'common'] })).toBe(false)
    expect(part({ ...ok, index: 10 })).toBe(false)
    expect(part({ ...ok, queues: ['Mail'] })).toBe(false)
    const { purpose: _purpose, ...keys } = ok
    expect(part(keys)).toBe(false)
  })

  test('every issue validate answers fits the issue schema', () => {
    const issue = ajv.compile(StructureIssueSchema)
    const broken: ProjectStructure = {
      areas: [...custom().areas, { key: 'partner', kind: ProjectArea.User, segment: 'partner' }],
      parts: custom().parts.map(p => p.name === 'dates' ? { ...p, dependsOn: ['backend', 'ghost'], mount: 'x', index: 3 } : p),
    }
    const issues = structureHelper.validate(broken)
    expect(issues.length).toBeGreaterThan(3)
    for (const one of issues) expect(issue(one)).toBe(true)
    expect(issue({ code: StructureIssueCode.Cycle, message: 'A cycle.', params: { part: 'x', max: 3 } })).toBe(true)
    expect(issue({ code: 'lost', message: 'Lost.' })).toBe(false)
    expect(issue({ code: StructureIssueCode.Cycle, message: 'A cycle.', params: { stray: 'x' } })).toBe(false)
  })

  test('no keyword the browser\'s validator or a stored record refuses', () => {
    for (const schema of [ProjectStructureSchema, StructureRefSchema, ViableStructureDecisionSchema, StructureIssueSchema, CatalogueChoiceSchema]) {
      const keywords = keywordsOf(schema)
      expect(keywords.has('multipleOf')).toBe(false)
      expect(keywords.has('format')).toBe(false)
      expect(JSON.stringify(schema)).not.toContain('"integer"')
    }
  })
})

describe('viable-common - the card fields a structure adds', () => {
  const project = ajv.compile(ViableProjectFieldsSchema)

  test('a card written before structures validates as it did; structure and caseBy are optional and nullable', () => {
    expect(project({})).toBe(true)
    expect(project({ language: 'en', blueprintCase: 'web' })).toBe(true)
    expect(project({ structure: null, caseBy: null })).toBe(true)
    for (const caseBy of VIABLE_BLUEPRINT_SOURCES) expect(project({ caseBy })).toBe(true)
    expect(project({ caseBy: 'owner' })).toBe(false)
    expect(VIABLE_BLUEPRINT_SOURCES).toEqual(['person', 'model'])
  })

  test('the fields one decision writes validate together; a malformed structure is refused', () => {
    const fields = structureHelper.decisionFieldsOf(custom(), 'person', at)
    expect(fields.structure).toBeDefined()
    expect(project({ ...fields, caseBy: 'person' })).toBe(true)
    expect(project({ structure: { ...fields.structure, by: 'request' } })).toBe(false)
    expect(project({ structure: { ...fields.structure, extra: 1 } })).toBe(false)
    expect(project(structureHelper.decisionFieldsOf(structureHelper.defaultFor([ProjectArea.User]), 'default', at))).toBe(true)

    const registry = makeSchemaRegistry({ flows: VIABLE_FLOW_SCHEMAS, types: VIABLE_TYPE_SCHEMAS })
    const validate = registry.validator(VIABLE_PROJECT_TYPE)
    expect(validate({ ...fields, caseBy: 'model' })).toBe(true)
    expect(validate({ structure: { ...fields.structure, at: undefined } })).toBe(false)
  })
})

describe('viable-common - the blueprint choice', () => {
  const choice = ajv.compile(CatalogueChoiceSchema)

  test('Auto is absent; every key nullable; a stray key, a half tenancy or a bad platform id is refused', () => {
    expect(choice({})).toBe(true)
    expect(choice({ stack: null, blueprint: null, case: null, botPlatforms: null, tenancy: null })).toBe(true)
    expect(choice({
      stack: 'owlmeans-fullstack-ts', blueprint: 'bot', case: 'support', botPlatforms: ['telegram'],
      tenancy: { users: true, operators: false },
    })).toBe(true)
    expect(choice({ tenancy: { users: true } })).toBe(false)
    expect(choice({ botPlatforms: ['Telegram'] })).toBe(false)
    expect(choice({ botPlatforms: [] })).toBe(false)
    expect(choice({ blueprint: '' })).toBe(false)
    expect(choice({ kit: 'support' })).toBe(false)
    expect(barrel.CatalogueChoiceSchema).toBe(CatalogueChoiceSchema)
    expect(barrel.ViableStructureDecisionSchema).toBe(ViableStructureDecisionSchema)
  })
})
