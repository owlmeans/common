import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { ProjectArea } from '../src/areas/consts.js'
import { RequirementKind, RequirementSource, SpecCategory } from '../src/ba/consts.js'
import { DesignStaleness, STORY_DESIGN_VERSION, StoryDesignSchema, storyDesignHelper } from '../src/design/index.js'
import type { StoryDesign } from '../src/design/index.js'

const design = (extra: Partial<StoryDesign> = {}): StoryDesign => storyDesignHelper.emptyStoryDesign({
  code: 'US-ABC12',
  narrative: 'A visitor books a slot.',
  area: ProjectArea.User,
  ...extra,
})

const withScreens = (): StoryDesign => design({
  screens: [{
    name: 'booking/list/overview',
    definition: 'booking-overview',
    path: 'sources/web/src/screens/booking-overview.tsx',
    alias: 'booking-overview',
    url: '/frontoffice/booking-overview',
    parent: 'area-user',
    section: 'Booking',
    adopted: false,
    specs: { ux: 'the ux', ui: 'the ui' },
    components: ['BookingList'],
  }],
  components: [{
    name: 'BookingList',
    definition: 'booking-list',
    path: 'sources/web/src/components/booking-list.view.tsx',
    viewModelPath: 'sources/web/src/components/booking-list.vm.ts',
    adopted: false,
    screen: 'booking/list/overview',
    entities: ['Booking'],
    specs: { ux: 'component ux', ui: 'component ui' },
  }],
  entities: [{ name: 'Booking', description: 'A reservation', dir: 'booking' }],
})

describe('viable-common - the design aggregate', () => {
  test('derives the UserStory the coders take, carrying the story code', () => {
    // The scaffold stamps every placeholder it draws with the code, so a run keyed by anything
    // else cannot recognise its own reservation.
    const story = storyDesignHelper.userStoryOfDesign(withScreens())

    expect(story.code).toBe('US-ABC12')
    expect(story.area).toBe(ProjectArea.User)
    expect(story.screens).toHaveLength(1)
    expect(story.screens[0].section).toBe('Booking')
    expect(story.screens[0].specs[SpecCategory.UX]).toBe('the ux')
    expect(story.screens[0].components[0].name).toBe('BookingList')
    expect(story.screens[0].components[0].entities[0].name).toBe('Booking')
  })

  test('drops a component reference the design does not carry rather than inventing one', () => {
    const broken = withScreens()
    broken.screens[0].components = ['BookingList', 'Ghost']

    expect(storyDesignHelper.userStoryOfDesign(broken).screens[0].components.map(entry => entry.name)).toEqual(['BookingList'])
  })

  test('screenMapOf is the shape every UX and UI prompt takes', () => {
    expect(storyDesignHelper.screenMapOf(withScreens())).toEqual({ 'booking/list/overview': ['BookingList'] })
  })
})

describe('viable-common - design staleness', () => {
  const now = { narrativeHash: 'n', projectHash: 'p', registryHash: 'r' }
  const fresh = (): StoryDesign => {
    const value = design()
    value.provenance = { ...value.provenance, ...now }

    return value
  }

  test('answers fresh when nothing moved', () => {
    expect(storyDesignHelper.designStaleness(fresh(), now)).toBe(DesignStaleness.Fresh)
  })

  test('ranks by severity: version, then narrative, then project, then tree', () => {
    // Each answer has one correct reaction, and collapsing them into a boolean makes every one of
    // them the most expensive of the four.
    const versioned = fresh()
    versioned.version = STORY_DESIGN_VERSION + 1
    expect(storyDesignHelper.designStaleness(versioned, now)).toBe(DesignStaleness.Version)

    expect(storyDesignHelper.designStaleness(fresh(), { ...now, narrativeHash: 'x' })).toBe(DesignStaleness.Narrative)
    expect(storyDesignHelper.designStaleness(fresh(), { ...now, projectHash: 'x' })).toBe(DesignStaleness.Project)
    expect(storyDesignHelper.designStaleness(fresh(), { ...now, registryHash: 'x' })).toBe(DesignStaleness.Tree)
  })

  test('a changed set of stated requirements re-designs, ranked right after the narrative', () => {
    // Absent on both sides is the design every story had before requirements existed.
    expect(storyDesignHelper.designStaleness(fresh(), { ...now, requirementsHash: '' })).toBe(DesignStaleness.Fresh)
    expect(storyDesignHelper.designStaleness(fresh(), { ...now, requirementsHash: 'q' })).toBe(DesignStaleness.Narrative)

    const hashed = fresh()
    hashed.provenance.requirementsHash = 'q'
    expect(storyDesignHelper.designStaleness(hashed, { ...now, requirementsHash: 'q' })).toBe(DesignStaleness.Fresh)
    expect(storyDesignHelper.designStaleness(hashed, now)).toBe(DesignStaleness.Narrative)
    expect(storyDesignHelper.designStaleness(hashed, { ...now, requirementsHash: 'q2', projectHash: 'x', registryHash: 'x' }))
      .toBe(DesignStaleness.Narrative)
    expect(storyDesignHelper.designStaleness(hashed, { ...now, requirementsHash: 'q', projectHash: 'x' }))
      .toBe(DesignStaleness.Project)
  })

  test('the hash is stable and distinguishes its inputs', () => {
    expect(storyDesignHelper.designHash('a', 'b')).toBe(storyDesignHelper.designHash('a', 'b'))
    expect(storyDesignHelper.designHash('a', 'b')).not.toBe(storyDesignHelper.designHash('a', 'c'))
    expect(storyDesignHelper.designHash('a', undefined)).toBe(storyDesignHelper.designHash('a'))
  })
})

describe('viable-common - the design schema', () => {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(StoryDesignSchema)

  test('accepts a design the library itself produced', () => {
    // Driven from the vocabulary, never from a hand-written fixture: a fixture pins only the
    // fields whoever wrote it remembered, which is how a field reaches the wire and misses its
    // schema.
    expect(validate(withScreens())).toBe(true)
  })

  test('accepts the empty design every stage starts from', () => {
    expect(validate(design())).toBe(true)
  })

  test('the empty design carries no requirements unless it is given some', () => {
    const empty = design()

    expect('requirements' in empty).toBe(false)
    expect('requirementsHash' in empty.provenance).toBe(false)
  })

  test('accepts stated requirements and their hash, and refuses an unknown part', () => {
    const value = withScreens()
    value.requirements = [{
      id: 'R1', quote: 'bookings must be exportable', statement: 'An admin exports bookings.',
      kind: RequirementKind.Story, parts: { ux: 'An export button on the list.' }, source: RequirementSource.Prompt,
    }]
    value.provenance.requirementsHash = 'abcd0123'
    expect(validate(value)).toBe(true)

    const rogue = withScreens()
    rogue.requirements = [{ ...value.requirements[0]!, parts: { qa: 'x' } as never }]
    expect(validate(rogue)).toBe(false)
  })

  test('persists scoped components and required read operations while accepting legacy API plans', () => {
    const value = withScreens()
    value.interaction = { entity: 'Booking', capabilities: ['list', 'read'], placement: 'destination', presentation: 'inline',
      componentResponsibilities: [{ component: value.components[0].path, entity: 'Booking', roles: ['collection'], capabilities: ['list', 'read'], scope: 'List and select bookings.' }] }
    value.api = [{ path: 'sources/api/src/app/booking/index.ts', entity: 'Booking', type: 'sources/common/src/models/booking.ts', model: '', endpoints: [], operations: ['list', 'get'] }]
    expect(validate(value)).toBe(true)
    expect(validate({ ...value, api: [{ ...value.api[0], operations: ['publish'] }] })).toBe(false)
    delete value.api[0].operations
    expect(validate(value)).toBe(true)
  })

  test('refuses a field the shape does not declare', () => {
    const rogue = { ...design(), somethingNew: 1 }

    expect(validate(rogue)).toBe(false)
  })

  test('refuses an area outside the closed set', () => {
    const rogue = { ...design(), area: 'partner' }

    expect(validate(rogue)).toBe(false)
  })

  test('keeps the write-back slots optional', () => {
    const value = withScreens()
    value.models = [{ path: 'sources/backend/src/domain/booking.ts', entities: ['Booking'] }]

    expect(validate(value)).toBe(true)
  })
})
