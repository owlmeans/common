import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { ProjectArea } from '../src/areas/consts.js'
import { SpecCategory } from '../src/ba/consts.js'
import {
  DesignStaleness, STORY_DESIGN_VERSION, StoryDesignSchema, designHash, designStaleness,
  emptyStoryDesign, screenMapOf, userStoryOf,
} from '../src/design/index.js'
import type { StoryDesign } from '../src/design/index.js'

const design = (extra: Partial<StoryDesign> = {}): StoryDesign => emptyStoryDesign({
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
    const story = userStoryOf(withScreens())

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

    expect(userStoryOf(broken).screens[0].components.map(entry => entry.name)).toEqual(['BookingList'])
  })

  test('screenMapOf is the shape every UX and UI prompt takes', () => {
    expect(screenMapOf(withScreens())).toEqual({ 'booking/list/overview': ['BookingList'] })
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
    expect(designStaleness(fresh(), now)).toBe(DesignStaleness.Fresh)
  })

  test('ranks by severity: version, then narrative, then project, then tree', () => {
    // Each answer has one correct reaction, and collapsing them into a boolean makes every one of
    // them the most expensive of the four.
    const versioned = fresh()
    versioned.version = STORY_DESIGN_VERSION + 1
    expect(designStaleness(versioned, now)).toBe(DesignStaleness.Version)

    expect(designStaleness(fresh(), { ...now, narrativeHash: 'x' })).toBe(DesignStaleness.Narrative)
    expect(designStaleness(fresh(), { ...now, projectHash: 'x' })).toBe(DesignStaleness.Project)
    expect(designStaleness(fresh(), { ...now, registryHash: 'x' })).toBe(DesignStaleness.Tree)
  })

  test('the hash is stable and distinguishes its inputs', () => {
    expect(designHash('a', 'b')).toBe(designHash('a', 'b'))
    expect(designHash('a', 'b')).not.toBe(designHash('a', 'c'))
    expect(designHash('a', undefined)).toBe(designHash('a'))
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
