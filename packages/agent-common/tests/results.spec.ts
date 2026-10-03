import { describe, expect, test } from 'bun:test'
import {
  CumulativeFactKind, CumulativeResultSource, RESULTS_EVERY_STEP,
  compareResultOrder, factKey, mergeResultsSpecs, pipelineAncestors, pipelineAncestry,
  pipelineDescendants, renderResultEntry, renderResultSummary, resultLabel,
} from '../src/index.js'
import type { CumulativeResultFact, PipelineSpec, RenderableResultEntry } from '../src/index.js'

/**
 * The pure half of cumulative pipeline results. What a later step is told is rendered here, so
 * every property a prompt depends on — the same facts give the same bytes, nothing varying leaks
 * in, a cap drops whole facts and says so — is pinned without a runtime.
 */

const diamond: PipelineSpec = {
  alias: 'diamond',
  version: 1,
  steps: [
    { step: 'root' },
    { step: 'left', after: ['root'] },
    { step: 'right', after: ['root'] },
    { step: 'deeper', after: ['right'] },
    { step: 'join', after: ['left', 'deeper'] },
    { step: 'aside' },
  ],
}

const user: CumulativeResultFact = {
  kind: CumulativeFactKind.Type, name: 'User', signature: '{ id: string;\n  email: string }',
  specifier: '@app/common', path: 'sources/common/src/user.ts',
}
const create: CumulativeResultFact = {
  kind: CumulativeFactKind.Endpoint, name: 'user.create', ref: 'User',
  attrs: { path: '/api/users', method: 'POST' },
}
const file: CumulativeResultFact = { kind: CumulativeFactKind.File, name: 'sources/common/src/user.ts' }

const entry = (patch: Partial<RenderableResultEntry> = {}): RenderableResultEntry => ({
  label: 'types', source: CumulativeResultSource.Extracted, facts: [user, create, file], ...patch,
})

describe('agent-common — pipeline ancestry', () => {
  test('names every transitive predecessor in topological order, never the step itself', () => {
    expect(pipelineAncestors(diamond, 'join')).toEqual(['root', 'left', 'right', 'deeper'])
    expect(pipelineAncestors(diamond, 'root')).toEqual([])
    // The mirror includes the named step; ancestry deliberately does not.
    expect(pipelineDescendants(diamond, 'root')).toContain('root')
  })

  test('carries the SHORTEST distance, so a direct predecessor is depth 1', () => {
    expect(pipelineAncestry(diamond, 'join')).toEqual([
      { step: 'root', depth: 2 },
      { step: 'left', depth: 1 },
      { step: 'right', depth: 2 },
      { step: 'deeper', depth: 1 },
    ])
  })

  test('refuses a step the spec does not declare', () => {
    expect(() => pipelineAncestors(diamond, 'ghost')).toThrow(/pipeline-step/)
  })
})

describe('agent-common — rendering an entry', () => {
  test('the same facts render the same bytes in whatever order they arrive', () => {
    const one = renderResultEntry(entry())
    const two = renderResultEntry(entry({ facts: [file, create, user] }))

    expect(two).toEqual(one)
    expect(one.full).toBe([
      '### types',
      '- endpoint `user.create` (method: POST, path: /api/users) → `User`',
      '- type `User`: { id: string; email: string } — import from `@app/common` (file `sources/common/src/user.ts`)',
      '- file `sources/common/src/user.ts`',
    ].join('\n'))
  })

  test('the names-only form lists names by kind and says it is names only', () => {
    expect(renderResultEntry(entry()).compact).toBe([
      '### types (names only)',
      '- endpoint: `user.create`',
      '- type: `User`',
      '- file: `sources/common/src/user.ts`',
    ].join('\n'))
  })

  test('over its cap it drops whole facts, never part of one, and says how many', () => {
    const { full } = renderResultEntry(entry(), { maxChars: 200 })

    expect(full.length).toBeLessThanOrEqual(200)
    expect(full).toContain('- endpoint `user.create`')
    expect(full).not.toContain('- type `User`')
    expect(full).toContain('and 2 more not listed here for space')
  })

  test('a summary is always labelled unverified, and a summary alone heads the entry so', () => {
    const withFacts = renderResultEntry(entry({ summary: 'Chose soft deletes.' })).full
    const alone = renderResultEntry(entry({
      facts: [], summary: 'Chose soft deletes.', source: CumulativeResultSource.Summarized,
    })).full

    expect(withFacts).toContain('Summary (not verified — written by a model, never checked against the files): Chose soft deletes.')
    expect(alone.split('\n')[0]).toBe('### types (not verified)')
  })

  test('a partial entry says the step failed, and an empty ordinary entry renders nothing', () => {
    expect(renderResultEntry(entry({ partial: true })).full.split('\n')[0])
      .toBe('### types (partial: the step failed part-way; only what it left in the files is listed)')
    expect(renderResultEntry(entry({ facts: [] }))).toEqual({ full: '', compact: '' })
  })
})

describe('agent-common — ledger helpers', () => {
  test('a composed run sorts inside its composing step, ahead of that step\'s own entry', () => {
    const keys = [[3], [1], [3, 2], [3, 1], [0], [4]]
    expect([...keys].sort(compareResultOrder)).toEqual([[0], [1], [3, 1], [3, 2], [3], [4]])
  })

  test('labels a composed run\'s step by its path under the root run', () => {
    expect(resultLabel('r', 'r', 'types')).toBe('types')
    expect(resultLabel('r', 'r/design', 'screens')).toBe('design/screens')
    expect(resultLabel('r', 'r/design/deep', 'x')).toBe('design/deep/x')
  })

  test('a fact is identified by kind, name and where it comes from', () => {
    expect(factKey(user)).toBe(factKey({ ...user, signature: 'other' }))
    expect(factKey(user)).not.toBe(factKey({ ...user, specifier: '@app/other' }))
  })

  test('a summary answer renders deterministically and is capped after the fact', () => {
    expect(renderResultSummary({ summary: '  two\nlines  ' })).toBe('two lines')
    expect(renderResultSummary({ b: ['x', 'y'], a: 1 })).toBe('a: 1; b: x, y')
    expect(renderResultSummary({ summary: 'word '.repeat(100) }, 40).length).toBeLessThanOrEqual(40)
  })

  test('merging declarations accumulates extractors and consumers, later scalars win', () => {
    const merged = mergeResultsSpecs(
      { window: 1, steps: { types: { extractors: ['ts'], full: ['resources'], maxChars: 100 } } },
      null,
      { window: 3, steps: { types: { extractors: ['ts', 'schema'], full: ['endpoints'], maxChars: 200 } } },
      { steps: { files: { full: RESULTS_EVERY_STEP } } },
    )

    expect(merged.window).toBe(3)
    expect(merged.steps?.types).toEqual({
      extractors: ['ts', 'schema'], full: ['resources', 'endpoints'], maxChars: 200,
    })
    expect(merged.steps?.files?.full).toBe(RESULTS_EVERY_STEP)
  })
})
