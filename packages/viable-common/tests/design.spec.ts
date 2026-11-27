import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { ProjectArea } from '../src/areas/consts.js'
import { RequirementKind, RequirementSource, SpecCategory } from '../src/ba/consts.js'
import { BotKitAction } from '../src/stack/index.js'
import { DesignStaleness, NO_RUNTIME, WORKCARD_DESIGN_VERSION, WorkcardDesignSchema, workcardDesignHelper, workcardRuntimeHelper } from '../src/design/index.js'
import type { WorkcardDesign } from '../src/design/index.js'

const design = (extra: Partial<WorkcardDesign> = {}): WorkcardDesign => workcardDesignHelper.emptyWorkcardDesign({
  code: 'US-ABC12',
  narrative: 'A visitor books a slot.',
  area: ProjectArea.User,
  ...extra,
})

const withScreens = (): WorkcardDesign => design({
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
    const workcard = workcardDesignHelper.userStoryOfDesign(withScreens())

    expect(workcard.code).toBe('US-ABC12')
    expect(workcard.area).toBe(ProjectArea.User)
    expect(workcard.screens).toHaveLength(1)
    expect(workcard.screens[0].section).toBe('Booking')
    expect(workcard.screens[0].specs[SpecCategory.UX]).toBe('the ux')
    expect(workcard.screens[0].components[0].name).toBe('BookingList')
    expect(workcard.screens[0].components[0].entities[0].name).toBe('Booking')
  })

  test('drops a component reference the design does not carry rather than inventing one', () => {
    const broken = withScreens()
    broken.screens[0].components = ['BookingList', 'Ghost']

    expect(workcardDesignHelper.userStoryOfDesign(broken).screens[0].components.map(entry => entry.name)).toEqual(['BookingList'])
  })

  test('screenMapOf is the shape every UX and UI prompt takes', () => {
    expect(workcardDesignHelper.screenMapOf(withScreens())).toEqual({ 'booking/list/overview': ['BookingList'] })
  })
})

describe('viable-common - design staleness', () => {
  const now = { narrativeHash: 'n', projectHash: 'p', registryHash: 'r' }
  const fresh = (): WorkcardDesign => {
    const value = design()
    value.provenance = { ...value.provenance, ...now }

    return value
  }

  test('answers fresh when nothing moved', () => {
    expect(workcardDesignHelper.designStaleness(fresh(), now)).toBe(DesignStaleness.Fresh)
  })

  test('ranks by severity: version, then narrative, then project, then tree', () => {
    // Each answer has one correct reaction, and collapsing them into a boolean makes every one of
    // them the most expensive of the four.
    const versioned = fresh()
    versioned.version = WORKCARD_DESIGN_VERSION + 1
    expect(workcardDesignHelper.designStaleness(versioned, now)).toBe(DesignStaleness.Version)

    expect(workcardDesignHelper.designStaleness(fresh(), { ...now, narrativeHash: 'x' })).toBe(DesignStaleness.Narrative)
    expect(workcardDesignHelper.designStaleness(fresh(), { ...now, projectHash: 'x' })).toBe(DesignStaleness.Project)
    expect(workcardDesignHelper.designStaleness(fresh(), { ...now, registryHash: 'x' })).toBe(DesignStaleness.Tree)
  })

  test('a changed set of stated requirements re-designs, ranked right after the narrative', () => {
    // Absent on both sides is the design every story had before requirements existed.
    expect(workcardDesignHelper.designStaleness(fresh(), { ...now, requirementsHash: '' })).toBe(DesignStaleness.Fresh)
    expect(workcardDesignHelper.designStaleness(fresh(), { ...now, requirementsHash: 'q' })).toBe(DesignStaleness.Narrative)

    const hashed = fresh()
    hashed.provenance.requirementsHash = 'q'
    expect(workcardDesignHelper.designStaleness(hashed, { ...now, requirementsHash: 'q' })).toBe(DesignStaleness.Fresh)
    expect(workcardDesignHelper.designStaleness(hashed, now)).toBe(DesignStaleness.Narrative)
    expect(workcardDesignHelper.designStaleness(hashed, { ...now, requirementsHash: 'q2', projectHash: 'x', registryHash: 'x' }))
      .toBe(DesignStaleness.Narrative)
    expect(workcardDesignHelper.designStaleness(hashed, { ...now, requirementsHash: 'q', projectHash: 'x' }))
      .toBe(DesignStaleness.Project)
  })

  test('the hash is stable and distinguishes its inputs', () => {
    expect(workcardDesignHelper.designHash('a', 'b')).toBe(workcardDesignHelper.designHash('a', 'b'))
    expect(workcardDesignHelper.designHash('a', 'b')).not.toBe(workcardDesignHelper.designHash('a', 'c'))
    expect(workcardDesignHelper.designHash('a', undefined)).toBe(workcardDesignHelper.designHash('a'))
  })
})

describe('viable-common - the design schema', () => {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(WorkcardDesignSchema)

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
      kind: RequirementKind.UserStory, parts: { ux: 'An export button on the list.' }, source: RequirementSource.Prompt,
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

  test('takes the area as a key: a custom slug passes, an ill-shaped key is refused', () => {
    expect(validate({ ...design(), area: 'partner' })).toBe(true)
    const rogue = { ...design(), area: 'Partner Portal' }

    expect(validate(rogue)).toBe(false)
  })

  test('accepts a runtime with bot handlers and refuses an unknown trigger or action', () => {
    const value = withScreens()
    value.runtime = {
      ...NO_RUNTIME,
      bot: {
        handlers: [
          { name: 'moderate', purpose: 'Follows the matched keyword group.', trigger: 'keywords', actions: [BotKitAction.Delete, BotKitAction.Warn], records: ['KeywordGroup'] },
          { name: 'report', purpose: 'Handles /report.', trigger: 'command', command: 'report', actions: [BotKitAction.Reply], agent: 'judge', records: ['Report'] },
        ],
      },
    }
    expect(validate(value)).toBe(true)

    const trigger = structuredClone(value)
    trigger.runtime!.bot!.handlers[0]!.trigger = 'schedule' as never
    expect(validate(trigger)).toBe(false)

    // No stock keyword rules: `rules` is no trigger.
    const rules = structuredClone(value)
    rules.runtime!.bot!.handlers[0]!.trigger = 'rules' as never
    expect(validate(rules)).toBe(false)

    const action = structuredClone(value)
    action.runtime!.bot!.handlers[0]!.actions = ['kick' as never]
    expect(validate(action)).toBe(false)
  })

  test('accepts a run design of several user stories, and refuses a unit without its keys', () => {
    // A combined run's design: the units' own story fields, every piece naming the units it serves.
    const value = withScreens()
    value.units = [
      { code: 'US-ABC12', cardId: 'card-1', narrative: 'A visitor books a slot.', area: ProjectArea.User, reserved: {}, landing: false },
      {
        code: 'US-DEF34', cardId: 'card-2', narrative: 'An admin reviews bookings.', area: ProjectArea.Admin,
        reserved: { section: 'Bookings' }, transitions: [{ from: 'a', to: 'b', initiator: 'c', action: 'open', type: 'navigate' }],
        dropped: 'screens failed',
      },
    ]
    value.screens[0].units = ['US-ABC12']
    value.components[0].units = ['US-ABC12', 'US-DEF34']
    value.models = [{ path: 'sources/backend/src/domain/booking.ts', entities: ['Booking'], units: ['US-ABC12', 'US-DEF34'] }]
    expect(validate(value)).toBe(true)

    const keyless = structuredClone(value)
    delete (keyless.units![1] as { cardId?: string }).cardId
    expect(validate(keyless)).toBe(false)

    const stray = structuredClone(value)
    ;(stray.units![0] as unknown as Record<string, unknown>).screens = []
    expect(validate(stray)).toBe(false)
  })

  test('keeps the write-back slots optional', () => {
    const value = withScreens()
    value.models = [{ path: 'sources/backend/src/domain/booking.ts', entities: ['Booking'] }]

    expect(validate(value)).toBe(true)
  })
})

describe('viable-common - the bot handlers of a runtime', () => {
  test('are total: a design without a runtime, or a runtime without a bot block, has none', () => {
    expect(workcardRuntimeHelper.botHandlersOf(workcardRuntimeHelper.runtimeOf(design()))).toEqual([])
    expect(workcardRuntimeHelper.botHandlersOf(NO_RUNTIME)).toEqual([])

    const handlers = [{ name: 'reply', purpose: 'Answers.', trigger: 'keywords' as const, actions: [BotKitAction.Reply], records: ['KeywordGroup'] }]
    expect(workcardRuntimeHelper.botHandlersOf({ ...NO_RUNTIME, bot: { handlers } })).toEqual(handlers)
    // Bot handlers are not queue work: the queue gate stays closed.
    expect(workcardRuntimeHelper.needsRuntime({ ...NO_RUNTIME, bot: { handlers } })).toBe(false)
  })
})
