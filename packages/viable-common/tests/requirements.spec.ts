import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { ProjectArea } from '../src/areas/consts.js'
import {
  REQUESTED_STORY_CAP, REQUIREMENT_PARTS, REQUIREMENTS_SECTIONS, RequirementKind, RequirementPart,
  RequirementSource, StoryKind,
} from '../src/ba/consts.js'
import { requirementsHelper } from '../src/ba/requirements.js'
import { RequirementsDocumentSchema } from '../src/ba/schemas.js'
import type { MergedStoryDraft, RequirementsDocument, StatedRequirement } from '../src/ba/types.js'
import { SubProject } from '../src/slot/consts.js'

const requirement = (id: string, extra: Partial<StatedRequirement> = {}): StatedRequirement => ({
  id,
  quote: `quote of ${id}`,
  statement: `Statement of ${id}.`,
  kind: RequirementKind.Rule,
  parts: {},
  source: id.startsWith('S') ? RequirementSource.Story : RequirementSource.Prompt,
  ...extra,
})

const items = (): StatedRequirement[] => [
  requirement('R10', {
    kind: RequirementKind.Rule,
    quote: 'store it with @owlmeans/planning',
    parts: { tech: 'Keep tasks as @owlmeans/planning cards.' },
    packages: [{ name: '@owlmeans/planning', side: SubProject.Backend }, { name: 'date-fns', side: SubProject.Web }],
  }),
  requirement('R2', {
    kind: RequirementKind.Story,
    quote: 'managers approve leave',
    statement: 'A manager approves a leave request.',
    parts: { ba: 'Only a manager approves.', ux: 'Approve from the request list.', ui: 'A green approve button.' },
  }),
  requirement('R1', {
    kind: RequirementKind.Platform,
    quote: 'users log in with Google',
    statement: 'People sign in with Google.',
    note: 'The platform signs people in.',
  }),
  requirement('S1', { parts: { ux: '  ' } }),
]

describe('viable-common - requirement ids', () => {
  test('R before S, then numerically', () => {
    expect(['S2', 'R10', 'R2', 'S1', 'R1'].sort(requirementsHelper.compareIds)).toEqual(['R1', 'R2', 'R10', 'S1', 'S2'])
    expect(requirementsHelper.compareIds('R2', 'R10')).toBeLessThan(0)
    expect(requirementsHelper.compareIds('S1', 'R40')).toBeGreaterThan(0)
    expect(requirementsHelper.compareIds('R3', 'R3')).toBe(0)
  })

  test('partsOf keeps the items with a non-empty text for a part, sorted by id', () => {
    expect(requirementsHelper.partsOf(items(), [RequirementPart.Ux, RequirementPart.Tech]).map(item => item.id))
      .toEqual(['R2', 'R10'])
    expect(requirementsHelper.partsOf(items(), [RequirementPart.Ui]).map(item => item.id)).toEqual(['R2'])
    expect(requirementsHelper.partsOf([requirement('S1', { parts: { ux: ' ' } })], REQUIREMENT_PARTS)).toEqual([])
  })
})

describe('viable-common - the requirements card', () => {
  test('is empty when no item carries a requested part', () => {
    expect(requirementsHelper.card([], REQUIREMENT_PARTS)).toBe('')
    expect(requirementsHelper.card([requirement('R1')], REQUIREMENT_PARTS)).toBe('')
    expect(requirementsHelper.card(items(), [])).toBe('')
  })

  test('lists each requested part in the order asked, packages under the technical part only', () => {
    expect(requirementsHelper.card(items(), [RequirementPart.Ux, RequirementPart.Tech, RequirementPart.Ba])).toBe([
      '# Stated requirements this story must honour',
      'What the requester asked for in their own words. Every line below is a requirement this work must '
        + 'satisfy; never drop or soften one.',
      '',
      '## UX (behaviour and flow)',
      '- R2: Approve from the request list. (requested as: "managers approve leave")',
      '',
      '## Technical (architecture, data, packages)',
      '- R10: Keep tasks as planning cards. (requested as: "store it with planning") — npm packages: '
        + 'planning (backend), date-fns (web)',
      '',
      '## Business rules',
      '- R2: Only a manager approves. (requested as: "managers approve leave")',
    ].join('\n'))
  })

  test('never carries an @owlmeans/ scope, so no package plugin derives a block from it', () => {
    expect(requirementsHelper.card(items(), REQUIREMENT_PARTS)).not.toContain('@owlmeans/')
  })

  test('is byte-stable for equal input in any order', () => {
    const forward = requirementsHelper.card(items(), REQUIREMENT_PARTS)

    expect(requirementsHelper.card([...items()].reverse(), REQUIREMENT_PARTS)).toBe(forward)
    expect(requirementsHelper.card(items(), [...REQUIREMENT_PARTS, RequirementPart.Tech])).toBe(forward)
  })
})

describe('viable-common - the specification sections', () => {
  test('are empty without items, or without a line in any section', () => {
    expect(requirementsHelper.specificationSections([])).toBe('')
    expect(requirementsHelper.specificationSections([requirement('R1')])).toBe('')
  })

  test('render sections 5-9 with markers, an empty section omitted', () => {
    expect(requirementsHelper.specificationSections(items())).toBe([
      '',
      '',
      '## Section 5. Requested capabilities',
      '',
      '- **R2** — A manager approves a leave request. (“managers approve leave”)',
      '',
      '## Section 6. Business rules',
      '',
      '- **R2** — Only a manager approves. (“managers approve leave”)',
      '',
      '## Section 7. Technical requirements',
      '',
      '- **R10** — Keep tasks as @owlmeans/planning cards. — npm packages: @owlmeans/planning (backend), '
        + 'date-fns (web) (“store it with @owlmeans/planning”)',
      '',
      '## Section 8. UX and UI requirements',
      '',
      '- **R2** — UX: Approve from the request list. (“managers approve leave”)',
      '- **R2** — UI: A green approve button. (“managers approve leave”)',
      '',
      '## Section 9. Provided by the platform',
      '',
      '- **R1** — People sign in with Google. — The platform signs people in. (“users log in with Google”)',
    ].join('\n'))
  })

  test('use the declared titles, in order', () => {
    const text = requirementsHelper.specificationSections(items())
    const at = REQUIREMENTS_SECTIONS.map(title => text.indexOf(`## ${title}`))

    expect(at.every(index => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  test('the markers are read back, and only the ones still in the specification are retained', () => {
    const spec = `# Brief${requirementsHelper.specificationSections(items())}`

    expect([...requirementsHelper.idsInSpecification(spec)].sort(requirementsHelper.compareIds)).toEqual(['R1', 'R2', 'R10'])

    const edited = spec.split('\n').filter(line => !line.startsWith('- **R10**')).join('\n')
    expect(requirementsHelper.retained(items(), edited).map(item => item.id)).toEqual(['R1', 'R2'])
  })

  test('a specification with none of the markers retains nothing', () => {
    expect(requirementsHelper.retained(items(), '# Brief\n\nThe sections were removed.')).toEqual([])
  })
})

describe('viable-common - slices and the target files', () => {
  const doc: RequirementsDocument = {
    version: 1,
    items: [
      requirement('R3', { stories: ['US-BBBBB'], parts: { ui: 'Dark header.' } }),
      requirement('R1', { stories: ['US-AAAAA', 'US-BBBBB'], parts: { tech: 'Postgres.', ba: 'Unique emails.' } }),
      requirement('R2', { parts: { ux: 'Nothing assigned.' } }),
    ],
    uncovered: ['R2'],
  }

  test('sliceFor answers the items assigned to a story, without their story codes', () => {
    const slice = requirementsHelper.sliceFor(doc, 'US-BBBBB')

    expect(slice.map(item => item.id)).toEqual(['R1', 'R3'])
    expect(slice.every(item => !('stories' in item))).toBe(true)
    expect(requirementsHelper.sliceFor(doc, 'US-CCCCC')).toEqual([])
    expect(doc.items[0]!.stories).toEqual(['US-BBBBB'])
  })

  test('frontmatterOf lists the ids per part, sorted, a part with none omitted', () => {
    expect(requirementsHelper.frontmatterOf([...requirementsHelper.sliceFor(doc, 'US-BBBBB'), requirement('S1', { parts: { ba: 'x' } })]))
      .toEqual({ [RequirementPart.Tech]: ['R1'], [RequirementPart.Ba]: ['R1', 'S1'], [RequirementPart.Ui]: ['R3'] })
    expect(requirementsHelper.frontmatterOf([])).toEqual({})
  })

  test('requirementsFile lists the project and each story with its own items, deterministically', () => {
    const stories = [
      { code: 'US-AAAAA', title: 'A member signs up.', items: [requirement('S2', { parts: { ux: 'Two steps.' } }), requirement('S1')] },
      { code: 'US-BBBBB', title: 'Nothing of its own.', items: [] },
    ]
    const file = requirementsHelper.requirementsFile(doc, stories)

    expect(file).toBe(requirementsHelper.requirementsFile(doc, stories))
    expect(file.startsWith('# Stated requirements\n')).toBe(true)
    expect(file).toContain('### R1. Statement of R1.')
    expect(file).toContain('- Stories: US-AAAAA, US-BBBBB')
    expect(file).toContain('- Technical (architecture, data, packages): Postgres.')
    expect(file).toContain('Not covered by any story yet: R2.')
    expect(file).toContain('## Story US-AAAAA. A member signs up.')
    expect(file.indexOf('### S1.')).toBeLessThan(file.indexOf('### S2.'))
    expect(file.indexOf('### R1.')).toBeLessThan(file.indexOf('### R2.'))
    expect(file).not.toContain('US-BBBBB. Nothing of its own.')
    expect(file.endsWith('\n')).toBe(true)
  })

  test('requirementsFile still says something when nothing was stated', () => {
    expect(requirementsHelper.requirementsFile({ version: 1, items: [] }, [])).toContain('No requirements were stated.')
  })
})

describe('viable-common - the requirements digest', () => {
  test('is stable across item and key order, and changes with the content', () => {
    const shuffled = items().reverse().map(item => Object.fromEntries(Object.entries(item).reverse()) as unknown as StatedRequirement)

    expect(requirementsHelper.digest(items())).toBe(requirementsHelper.digest(shuffled))
    expect(requirementsHelper.digest(items())).toMatch(/^[0-9a-f]{8}$/)
    expect(requirementsHelper.digest(items())).not.toBe(requirementsHelper.digest(items().slice(1)))
    expect(requirementsHelper.digest([requirement('R1', { parts: { ux: 'a' } })]))
      .not.toBe(requirementsHelper.digest([requirement('R1', { parts: { ux: 'b' } })]))
    expect(requirementsHelper.digest([])).toBe(requirementsHelper.digest([]))
  })
})

describe('viable-common - requested stories', () => {
  const merged = (): MergedStoryDraft[] => [
    { story: 'One', area: ProjectArea.User, kind: StoryKind.Flow },
    { story: 'Tracker', area: ProjectArea.User, kind: StoryKind.Connective, after: 1 },
    { story: 'Two', area: ProjectArea.User, kind: StoryKind.Flow },
    { story: 'Three', area: ProjectArea.Admin, kind: StoryKind.Flow },
    { story: 'Queue', area: ProjectArea.Admin, kind: StoryKind.Connective, after: 3 },
  ]
  const shape = (list: MergedStoryDraft[]) => list.map(({ story, kind, after }) => ({ story, kind, after }))

  test('lands each after the last entry of its flow story, in input order, carrying the clamped anchor', () => {
    const input = merged()
    const result = requirementsHelper.mergeRequested(input, [
      { story: ' Export ', area: ProjectArea.Admin, covers: ['R4'], after: 1 },
      { story: 'Audit', area: ProjectArea.Admin, covers: ['R5'], after: 1 },
      { story: 'Late', area: ProjectArea.User, covers: ['R6'], after: 99 },
      { story: 'Early', area: ProjectArea.User, covers: ['R7'], after: 0 },
      { story: 'Anywhere', area: ProjectArea.User, covers: ['R8'] },
    ])

    expect(shape(result)).toEqual([
      { story: 'One', kind: StoryKind.Flow, after: undefined },
      { story: 'Tracker', kind: StoryKind.Connective, after: 1 },
      { story: 'Export', kind: StoryKind.Requested, after: 1 },
      { story: 'Audit', kind: StoryKind.Requested, after: 1 },
      { story: 'Early', kind: StoryKind.Requested, after: 1 },
      { story: 'Two', kind: StoryKind.Flow, after: undefined },
      { story: 'Three', kind: StoryKind.Flow, after: undefined },
      { story: 'Queue', kind: StoryKind.Connective, after: 3 },
      { story: 'Late', kind: StoryKind.Requested, after: 3 },
      { story: 'Anywhere', kind: StoryKind.Requested, after: undefined },
    ])
    expect('after' in result.at(-1)!).toBe(false)
    expect('covers' in result[2]!).toBe(false)
    expect(shape(input)).toEqual(shape(merged()))
  })

  test('keeps the flow and connective entries in place, so every connective anchor stays valid', () => {
    const result = requirementsHelper.mergeRequested(merged(), [
      { story: 'Middle', area: ProjectArea.User, covers: ['R1'], after: 2 },
    ])
    const flows = result.filter(entry => entry.kind === StoryKind.Flow)

    expect(result.filter(entry => entry.kind !== StoryKind.Requested)).toEqual(merged())
    for (const [index, entry] of result.entries()) {
      if (entry.kind === StoryKind.Flow || entry.after == null) continue
      const anchor = flows[entry.after - 1]!
      const between = result.slice(result.indexOf(anchor) + 1, index)
      expect(between.every(other => other.kind !== StoryKind.Flow), entry.story).toBe(true)
    }
  })

  test('drops a draft repeating an existing entry or an earlier draft, and an empty one', () => {
    const result = requirementsHelper.mergeRequested(merged(), [
      { story: '  one ', area: ProjectArea.User, covers: ['R1'], after: 1 },
      { story: 'Export   ORDERS', area: ProjectArea.User, covers: ['R2'], after: 2 },
      { story: 'export orders', area: ProjectArea.User, covers: ['R3'], after: 3 },
      { story: '   ', area: ProjectArea.User, covers: ['R4'] },
    ])

    expect(result.filter(entry => entry.kind === StoryKind.Requested).map(entry => entry.story)).toEqual(['Export   ORDERS'])
  })

  test('keeps at most the cap, in input order', () => {
    const many = Array.from({ length: REQUESTED_STORY_CAP + 3 }, (_, index) => (
      { story: `Requested ${index}`, area: ProjectArea.User, covers: [`R${index + 1}`] }
    ))
    const kept = requirementsHelper.mergeRequested(merged(), many).filter(entry => entry.kind === StoryKind.Requested)

    expect(kept.map(entry => entry.story)).toEqual(many.slice(0, REQUESTED_STORY_CAP).map(draft => draft.story))
  })

  test('appends everything, unanchored, to a list without a flow', () => {
    expect(shape(requirementsHelper.mergeRequested([], [{ story: 'Alone', area: ProjectArea.User, covers: ['R1'], after: 2 }])))
      .toEqual([{ story: 'Alone', kind: StoryKind.Requested, after: undefined }])
  })
})

describe('viable-common - the requirements document schema', () => {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(RequirementsDocumentSchema)

  test('accepts a project document and a story slice', () => {
    expect(validate({ version: 1, items: items(), assignedAt: '2026-10-23T10:00:00.000Z', uncovered: ['R2'] })).toBe(true)
    expect(validate({ version: 1, items: requirementsHelper.sliceFor({ version: 1, items: items() }, 'US-AAAAA') })).toBe(true)
    expect(validate({ version: 1, items: [] })).toBe(true)
  })

  test('refuses an id outside R/S, a kind or part outside the vocabulary, and a stray field', () => {
    expect(validate({ version: 1, items: [requirement('X1')] })).toBe(false)
    expect(validate({ version: 1, items: [{ ...requirement('R1'), kind: 'wish' }] })).toBe(false)
    expect(validate({ version: 1, items: [{ ...requirement('R1'), parts: { qa: 'x' } }] })).toBe(false)
    expect(validate({ version: 1, items: [{ ...requirement('R1'), packages: [{ name: 'x', side: 'mobile' }] }] })).toBe(false)
    expect(validate({ version: 1, items: [], extra: true })).toBe(false)
    expect(validate({ items: [] })).toBe(false)
  })
})
