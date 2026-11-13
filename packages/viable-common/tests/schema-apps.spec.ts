import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { makeSchemaRegistry } from '@owlmeans/planning'
import { ProjectArea } from '../src/areas/consts.js'
import { StoryDesignSchema, storyDesignHelper } from '../src/design/index.js'
import type { StoryDesign } from '../src/design/index.js'
import {
  VIABLE_FLOW_SCHEMAS, VIABLE_PROJECT_TYPE, VIABLE_STORY_TYPE, VIABLE_TYPE_SCHEMAS, ViableProjectFieldsSchema,
  ViableStoryFieldsSchema,
} from '../src/planning/index.js'
import { ScaffoldPlanAnswerSchema, ScaffoldPlanSchema } from '../src/scaffold/schemas.js'
import type { ScaffoldPlan } from '../src/scaffold/types.js'
import { WidgetKind } from '../src/scaffold/consts.js'
import { appMapHelper } from '../src/topology/apps.js'

/**
 * Every key the apps programme adds to a stored document is OPTIONAL and nullable: a card, a design
 * or a plan written before must validate exactly as it did, an explicit `null` (a provider's unset
 * optional, a cleared wire field) must pass, and a key nobody declared must still be refused.
 */
const ajv = addFormats(new Ajv({ allErrors: true, strict: false }))
const at = '2026-11-11T10:00:00.000Z'

describe('viable-common - the card fields an app map adds', () => {
  const project = ajv.compile(ViableProjectFieldsSchema)
  const story = ajv.compile(ViableStoryFieldsSchema)

  test('a project card written before apps validates as it did', () => {
    expect(project({})).toBe(true)
    expect(project({ language: 'en', blueprintCase: 'web', tenancy: { operators: false, users: true, by: 'model', at } })).toBe(true)
    expect(project({ alias: 'x' })).toBe(false)
  })

  test('a project records its app map, or null; a malformed one is refused', () => {
    expect(project({ apps: { ...appMapHelper.defaultFor(['user', 'admin', 'operator']), by: 'default', at } })).toBe(true)
    expect(project({ apps: { ...appMapHelper.legacy(), by: 'owner', quote: null, at } })).toBe(true)
    expect(project({ apps: null })).toBe(true)
    expect(project({ apps: { ...appMapHelper.legacy(), at } })).toBe(false)
    expect(project({ apps: { ...appMapHelper.legacy(), by: 'default', at, extra: 1 } })).toBe(false)
    expect(project({ apps: { areas: [], apps: [], by: 'default', at } })).toBe(false)
  })

  test('a story written before apps validates unchanged — every standard kind is a valid area key', () => {
    for (const area of Object.values(ProjectArea)) expect(story({ area, primary: false })).toBe(true)
    expect(story({ area: ProjectArea.User, primary: false, areas: ['admin', 'operator'] })).toBe(true)
    expect(story({ area: ProjectArea.User, primary: false, areas: null })).toBe(true)
    expect(story({ area: ProjectArea.User, primary: false, areas: [] })).toBe(true)
  })

  test('the area is a key: a custom slug passes, ill-formed keys, a separate areaKey, duplicates and strays are refused', () => {
    expect(story({ area: 'partner-portal', primary: false })).toBe(true)
    expect(story({ area: 'partner-portal', primary: false, areas: ['admin'] })).toBe(true)
    expect(story({ area: 'Partner Portal', primary: false })).toBe(false)
    expect(story({ area: 'a--b', primary: false })).toBe(false)
    expect(story({ area: '', primary: false })).toBe(false)
    expect(story({ area: ProjectArea.User, primary: false, areaKey: 'partner-portal' })).toBe(false)
    expect(story({ area: ProjectArea.User, primary: false, areas: ['admin', 'admin'] })).toBe(false)
    expect(story({ area: ProjectArea.User, primary: false, app: 'admin' })).toBe(false)
  })

  test('the planning registry still compiles every type, and checks old and new cards with them', () => {
    const registry = makeSchemaRegistry({ flows: VIABLE_FLOW_SCHEMAS, types: VIABLE_TYPE_SCHEMAS })
    const storyFields = registry.validator(VIABLE_STORY_TYPE)
    const projectFields = registry.validator(VIABLE_PROJECT_TYPE)
    expect(storyFields({ area: ProjectArea.User, primary: true })).toBe(true)
    expect(storyFields({ area: 'partner-portal', primary: true, areas: ['admin'] })).toBe(true)
    expect(storyFields({ area: ProjectArea.User, primary: true, areaKey: null })).toBe(false)
    expect(storyFields({ area: ProjectArea.User, primary: true, stray: 1 })).toBe(false)
    expect(projectFields({ language: 'en' })).toBe(true)
    expect(projectFields({ apps: { ...appMapHelper.defaultFor(['user', 'admin']), by: 'default', at } })).toBe(true)
    expect(projectFields({ apps: { ...appMapHelper.legacy(), by: 'default' } })).toBe(false)
  })
})

describe('viable-common - the design keys an app map adds', () => {
  const validate = ajv.compile(StoryDesignSchema)
  const design = (): StoryDesign => ({
    ...storyDesignHelper.emptyStoryDesign({ code: 'US-ABC12', narrative: 'A visitor books a slot.', area: ProjectArea.User }),
    screens: [{
      name: 'booking/list/overview', definition: 'booking-overview', path: 'sources/web/src/screens/booking-overview.tsx',
      alias: 'booking-overview', url: '/frontoffice/booking-overview', parent: 'area-user', adopted: false,
      specs: { ux: 'u', ui: 'i' }, components: ['BookingList'],
    }],
    components: [{
      name: 'BookingList', definition: 'booking-list', path: 'sources/web/src/components/booking-list.view.tsx',
      viewModelPath: 'sources/web/src/components/booking-list.vm.ts', adopted: false, screen: 'booking/list/overview',
      entities: ['Booking'], specs: { ux: 'u', ui: 'i' },
    }],
    api: [{ path: 'sources/api/src/app/booking', entity: 'Booking', type: 'Booking', model: 'booking', endpoints: [] }],
    stores: [{ path: 'sources/web/src/store/booking.ts', entity: 'Booking', type: 'Booking', api: 'booking' }],
  })

  test('a design written before apps validates as it did', () => {
    expect(validate(design())).toBe(true)
    expect(validate({ ...design(), stray: true })).toBe(false)
  })

  test('the story\'s area key, its further areas, a screen\'s area and the app of a group, store and component', () => {
    const multi = design()
    multi.area = 'partner-portal'
    multi.areas = ['admin']
    multi.screens[0].area = 'admin'
    multi.components[0].app = 'admin'
    multi.api[0].app = 'admin'
    multi.stores[0].app = 'admin'
    expect(validate(multi)).toBe(true)
  })

  test('every new key accepts null; a stray inside an item is still refused', () => {
    const nulled = JSON.parse(JSON.stringify(design())) as Record<string, any>
    nulled.areas = null
    nulled.screens[0].area = null
    nulled.components[0].app = null
    nulled.api[0].app = null
    nulled.stores[0].app = null
    expect(validate(nulled)).toBe(true)
    const stray = JSON.parse(JSON.stringify(design())) as Record<string, any>
    stray.stores[0].mount = 'admin'
    expect(validate(stray)).toBe(false)
    expect(validate({ ...design(), areaKey: 'partner-portal' })).toBe(false)
    expect(validate({ ...design(), area: 'Partner Portal' })).toBe(false)
  })
})

describe('viable-common - the scaffold key an app map adds', () => {
  const stored = ajv.compile(ScaffoldPlanSchema)
  const plan = (): ScaffoldPlan => ({
    identity: { name: 'Crumb & Crust', description: 'Recipes and bakes.' },
    guestHome: {
      hero: { headline: 'Find your next bake.', sub: 'Photo-led recipes.', cta: 'Get started' },
      problem: { title: 'Inspiration lacks detail', text: 'A bake is easy to find.' },
      solution: { title: 'Bakes worth making', text: 'The full process in one place.' },
      features: [{ title: 'Complete recipes', text: 'Clear ingredient lists.' }],
    },
    areas: [{ area: ProjectArea.Guest, intro: { title: 'Welcome', text: 'Browse.' }, sections: ['Bakes'] }],
    stories: [{
      code: 'US-ABC12', section: 'Bakes', screen: 'Bakes/Find a bake',
      widget: { kind: WidgetKind.List, title: 'Bake finder', description: 'Bakes you can make.' },
      sketch: { headline: 'Your bakes', caption: 'What you can bake', items: ['Rye loaf'] },
      home: true,
    }],
    motifs: 'A rye loaf on a board.',
  })

  test('a stored plan written before apps validates; an area entry names its area by key', () => {
    expect(stored(plan())).toBe(true)
    const keyed = plan()
    keyed.areas.push({ area: 'partner-portal', intro: { title: 'Partners', text: 'Your work.' }, sections: [] })
    expect(stored(keyed)).toBe(true)
    expect(stored({ ...plan(), areas: [{ ...plan().areas[0], area: 'Partner Portal' }] })).toBe(false)
    expect(stored({ ...plan(), areas: [{ ...plan().areas[0], areaKey: 'partner-portal' }] })).toBe(false)
    expect(stored({ ...plan(), areas: [{ ...plan().areas[0], app: 'admin' }] })).toBe(false)
  })

  test('the model is offered the four kinds — the answer schema is what it was', () => {
    const areaItems = (ScaffoldPlanAnswerSchema as unknown as { properties: { areas: { items: { properties: Record<string, object>, required: string[] } } } })
      .properties.areas.items
    expect(areaItems.properties.area).toEqual({ type: 'string', enum: Object.values(ProjectArea), description: 'guest, user, admin or operator' })
    expect(Object.keys(areaItems.properties)).toEqual(['area', 'intro', 'sections'])
    expect(areaItems.required).toEqual(['area', 'intro', 'sections'])
    expect(Object.keys((ScaffoldPlanAnswerSchema as unknown as { properties: object }).properties))
      .toEqual(['identity', 'guestHome', 'areas', 'stories', 'motifs'])
  })
})
