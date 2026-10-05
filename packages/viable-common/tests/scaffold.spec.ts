import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { ProjectArea } from '../src/areas/consts.js'
import { ViableSpecCategory, VIABLE_PROJECT_SLOTS } from '../src/planning/index.js'
import {
  BENTO_FRAGMENT_KINDS, LANDING_ANCHOR_BAND, LANDING_ANCHORS, LANDING_BAND_ORDER, LANDING_GATE_FIELD_KINDS,
  LANDING_GATE_SLOTS, LANDING_SLOTS, WidgetKind,
} from '../src/scaffold/consts.js'
import { landingPlanHelper } from '../src/scaffold/landing.js'
import * as barrel from '../src/index.js'
import { ScaffoldPlanAnswerSchema, ScaffoldPlanSchema } from '../src/scaffold/schemas.js'
import type { GuestHomePlan, ScaffoldPlan } from '../src/scaffold/types.js'
import { validateHelper } from '@owlmeans/planning'

/**
 * The scaffold plan's schema is TWO things at once: the shape a model answers with, and the
 * validator of the project card's `scaffold` document. A plan written before the landing-page
 * overhaul carries none of its fields, and must still pass — or that project's plan can never be
 * revised again. Compiled the way the planning registry compiles it (no formats, not strict).
 */
const oldPlan = (): ScaffoldPlan => ({
  identity: { name: 'Crumb & Crust', description: 'Recipes and bakes from a welcoming community.' },
  guestHome: {
    hero: { headline: 'Find your next bake.', sub: 'Photo-led recipes.', cta: 'Get started', eyebrow: 'New' },
    problem: { title: 'Inspiration lacks detail', text: 'A bake is easy to find.' },
    solution: { title: 'Bakes worth making', text: 'The full process in one place.' },
    features: [{ title: 'Complete recipes', text: 'Clear ingredient lists.' }],
    testimonials: [{ quote: 'I found a rye loaf.', name: 'Mara L.', role: 'Home baker' }],
  },
  areas: [{ area: ProjectArea.Guest, intro: { title: 'Welcome', text: 'Browse.' }, sections: ['Bakes'] }],
  stories: [{
    code: 'US-ABC12',
    section: 'Bakes',
    screen: 'Bakes/Find a bake',
    widget: { kind: WidgetKind.List, title: 'Bake finder', description: 'Bakes you can make.' },
    sketch: { headline: 'Your bakes', caption: 'What you can bake', items: ['Rye loaf'] },
    home: true,
  }],
  motifs: 'A rye loaf on a board.',
})

const newPlan = (): ScaffoldPlan => {
  const plan = oldPlan()

  return {
    ...plan,
    guestHome: {
      ...plan.guestHome,
      hero: {
        headline: 'Find your next bake.', sub: 'Photo-led recipes.', cta: 'Get started',
        secondary: { label: 'Browse bakes' },
        browse: { label: 'Just browsing? Explore bakes', href: '#features' },
      },
      features: [
        {
          title: 'Complete recipes', text: 'Clear ingredient lists.',
          fragment: {
            kind: 'list', title: 'INGREDIENTS · 1 LOAF',
            rows: [{ label: 'Rye flour', value: '350 g' }, { label: 'Water', value: '390 g' }],
          },
        },
        { title: 'Baking notes', text: 'Small adjustments.', fragment: { kind: 'note', rows: [{ label: 'Drop the oven.' }] } },
        { title: 'Photo-led bakes', text: 'Every idea starts with the bake.' },
        { title: 'Baker attribution', text: 'See who made it.', fragment: { kind: 'people', rows: [{ label: 'Mara L.', value: 'Rye' }] } },
      ],
      steps: [
        { title: 'Pick what you have', text: 'Tap the ingredients.' },
        { title: 'See what you can bake', text: 'Ranked by your pantry.' },
        { title: 'Open the full method', text: 'Sign in with your email.' },
      ],
      labels: { steps: 'How it works', stepsTitle: 'From pantry to basket.', problem: 'The problem' },
      closing: {
        headline: 'Your next bake starts here.', lead: 'Browse freely.', primary: 'Get started',
        secondary: { label: 'Browse bakes' },
        links: [{ title: 'Explore bakes', text: 'Open to everyone.' }, { title: 'Share your bake', text: 'Post it.', href: '#' }],
      },
      gate: {
        story: 'US-ABC12',
        target: 'web:bake-finder',
        question: 'What are you baking?',
        fields: [{ name: 'dish', label: 'What are you baking?', kind: 'text', placeholder: 'Rye sourdough' }],
        cta: 'Start my bake →',
        note: 'No account needed. What you enter comes with you.',
      },
    },
  }
}

/** The gate a plan stored BEFORE it became a form: chips, sample records, a live count. */
const legacyGate = (): NonNullable<ScaffoldPlan['guestHome']['gate']> => ({
  story: 'US-ABC12',
  target: 'web:bake-finder',
  question: "What's in your pantry?",
  hint: 'No account needed',
  label: 'Your pantry',
  inputs: ['Bread flour', 'Rye flour', 'Butter', 'Eggs', 'Yeast'],
  selected: ['Bread flour', 'Rye flour', 'Butter', 'Yeast'],
  results: [{ title: 'Seeded rye loaf', meta: 'Uses all 3 · 3 h 20 min', needs: ['Bread flour', 'Rye flour', 'Yeast'] }],
  count: { one: '{n} bake matches', many: '{n} bakes match', none: 'No matches yet' },
  empty: 'Pick two or more ingredients.',
  note: 'Sign in with your email. Your picks come with you.',
  cta: 'Open recipes →',
  lock: 'Full method after sign-in',
})

describe('viable-common - the scaffold plan schema', () => {
  const validate = new Ajv({ strict: false, allErrors: true }).compile(ScaffoldPlanSchema)
  const slot = VIABLE_PROJECT_SLOTS.find(entry => entry.category === ViableSpecCategory.Scaffold)!

  test('a plan stored before the landing overhaul still validates', () => {
    expect(validate(oldPlan()), JSON.stringify(validate.errors)).toBe(true)
    expect(() => validateHelper.validateSpecificationBody(slot, JSON.stringify(oldPlan()))).not.toThrow()
  })

  test('a plan carrying every new field validates', () => {
    expect(validate(newPlan()), JSON.stringify(validate.errors)).toBe(true)
    expect(() => validateHelper.validateSpecificationBody(slot, JSON.stringify(newPlan()))).not.toThrow()
  })

  test('a provider that spells an unset optional as null is accepted', () => {
    const plan = newPlan() as unknown as { guestHome: Record<string, unknown> }
    plan.guestHome.gate = null
    plan.guestHome.closing = null
    ;(plan.guestHome.hero as Record<string, unknown>).secondary = null

    expect(validate(plan), JSON.stringify(validate.errors)).toBe(true)
  })

  test('still refuses an undeclared field and a fragment kind nothing can draw', () => {
    const stray = newPlan() as unknown as { guestHome: Record<string, unknown> }
    stray.guestHome.badge = 'New'
    expect(validate(stray)).toBe(false)

    const fragment = newPlan()
    fragment.guestHome.features[0].fragment = { kind: 'chart' as never, rows: [] }
    expect(validate(fragment)).toBe(false)
  })

  test('declares no count as minItems/maxItems — counts live in the descriptions', () => {
    const text = JSON.stringify(ScaffoldPlanSchema)

    expect(text).not.toContain('minItems')
    expect(text).not.toContain('maxItems')
    expect(BENTO_FRAGMENT_KINDS).toEqual(['list', 'note', 'people', 'steps'])
  })

  test('a plan stored under the chip-gate shape still validates', () => {
    const stored = newPlan()
    stored.guestHome.gate = legacyGate()

    expect(validate(stored), JSON.stringify(validate.errors)).toBe(true)
    expect(() => validateHelper.validateSpecificationBody(slot, JSON.stringify(stored))).not.toThrow()
  })

  test('a field kind nothing can draw is refused', () => {
    const plan = newPlan()
    plan.guestHome.gate!.fields![0] = { name: 'dish', label: 'Dish', kind: 'multiselect' as never }

    expect(validate(plan)).toBe(false)
    expect(LANDING_GATE_FIELD_KINDS).toEqual(['text', 'select', 'number', 'date'])
  })
})

describe('viable-common - the scaffold plan the model answers', () => {
  const answer = new Ajv({ strict: false, allErrors: true }).compile(ScaffoldPlanAnswerSchema)

  test('accepts the form gate', () => {
    expect(answer(newPlan()), JSON.stringify(answer.errors)).toBe(true)
  })

  test('accepts an unset optional written as null, and no gate at all', () => {
    const nulled = newPlan()
    ;(nulled.guestHome.gate!.fields![0] as unknown as Record<string, unknown>).options = null
    expect(answer(nulled), JSON.stringify(answer.errors)).toBe(true)

    const none = newPlan()
    delete none.guestHome.gate
    expect(answer(none), JSON.stringify(answer.errors)).toBe(true)
  })

  test('is never offered the chip-gate keys, and requires the form\'s fields', () => {
    const chips = newPlan()
    chips.guestHome.gate = legacyGate()
    expect(answer(chips)).toBe(false)

    const bare = newPlan()
    delete bare.guestHome.gate!.fields
    expect(answer(bare)).toBe(false)

    const text = JSON.stringify(ScaffoldPlanAnswerSchema)
    expect(text).not.toContain('"inputs"')
    expect(text).not.toContain('"results"')
    expect(text).not.toContain('minItems')
    expect(text).not.toContain('maxItems')
  })
})

const BASIS = 'bakers who want the full method'

/** A plan carrying every key the gated landing page added. */
const landingPlan = (): ScaffoldPlan => {
  const plan = newPlan()

  return {
    ...plan,
    guestHome: {
      ...plan.guestHome,
      testimonials: [
        { quote: 'I found a rye loaf.', name: 'Mara L.', role: 'Home baker' },
        { quote: 'The notes saved my bake.', name: 'Jon K.', role: 'Weekend baker' },
      ],
      useCases: {
        cases: [
          { audience: 'Home bakers', title: 'Bake from the pantry', text: 'Use what is at hand.' },
          { audience: 'Teachers', title: 'Run a class', text: 'Share one method.' },
          { audience: 'Clubs', title: 'Swap bakes', text: 'Trade notes.' },
        ],
        basis: BASIS,
      },
      differentiator: {
        title: 'The method, not the photo', text: 'Every bake carries its full method.',
        contrast: [{ usual: 'A photo', ours: 'The full method' }, { usual: 'Guesswork', ours: 'Notes' }],
        usualLabel: 'Usually', oursLabel: 'With us', basis: BASIS,
      },
      approach: {
        title: 'Honest notes.',
        principles: [
          { title: 'Real bakes', text: 'Made at home.' },
          { title: 'Full methods', text: 'Nothing skipped.' },
          { title: 'Credit bakers', text: 'Names stay on.' },
        ],
        basis: BASIS,
      },
      about: { title: 'Who we are', text: 'Bakers sharing bakes.', basis: BASIS },
      labels: {
        ...plan.guestHome.labels,
        useCases: 'Who it is for', useCasesTitle: 'Made for bakers.', differentiator: 'Why us',
        approach: 'How we work', approachTitle: 'Small batches.', about: 'About',
      },
      menu: [{ anchor: 'how', label: 'Steps' }, { anchor: 'why', label: 'Why' }, { anchor: 'about', label: 'Us' }],
      links: [{ slot: 'hero.browse', story: 'US-ABC12' }, { slot: 'useCase.1', story: 'US-ABC12' }],
    },
  }
}

/** The new optional keys of the guest home and of its labels. */
const NEW_HOME_KEYS = ['testimonials', 'useCases', 'differentiator', 'approach', 'about', 'menu', 'links'] as const
const NEW_LABEL_KEYS = ['useCases', 'useCasesTitle', 'differentiator', 'approach', 'approachTitle', 'about'] as const

describe('viable-common - the gated landing page in the scaffold plan schema', () => {
  const validate = new Ajv({ strict: false, allErrors: true }).compile(ScaffoldPlanSchema)
  const answer = new Ajv({ strict: false, allErrors: true }).compile(ScaffoldPlanAnswerSchema)
  const slot = VIABLE_PROJECT_SLOTS.find(entry => entry.category === ViableSpecCategory.Scaffold)!

  test('an old stored plan and a plan with every new key both validate, stored and answered', () => {
    expect(validate(oldPlan()), JSON.stringify(validate.errors)).toBe(true)
    expect(validate(landingPlan()), JSON.stringify(validate.errors)).toBe(true)
    expect(() => validateHelper.validateSpecificationBody(slot, JSON.stringify(landingPlan()))).not.toThrow()
    expect(answer(landingPlan()), JSON.stringify(answer.errors)).toBe(true)
  })

  test('every new optional key accepts null', () => {
    for (const key of NEW_HOME_KEYS) {
      const plan = landingPlan() as unknown as { guestHome: Record<string, unknown> }
      plan.guestHome[key] = null
      expect(validate(plan), `${key}: ${JSON.stringify(validate.errors)}`).toBe(true)
      expect(answer(plan), `${key}: ${JSON.stringify(answer.errors)}`).toBe(true)
    }
    for (const key of NEW_LABEL_KEYS) {
      const plan = landingPlan() as unknown as { guestHome: { labels: Record<string, unknown> } }
      plan.guestHome.labels[key] = null
      expect(validate(plan), `labels.${key}: ${JSON.stringify(validate.errors)}`).toBe(true)
    }
    const labels = landingPlan()
    labels.guestHome.differentiator!.usualLabel = null
    labels.guestHome.differentiator!.oursLabel = null
    labels.guestHome.approach!.title = null
    expect(validate(labels), JSON.stringify(validate.errors)).toBe(true)
  })

  test('linksDecided is stored (a list, null or absent) and never offered to the model', () => {
    for (const value of [['US-ABC12', 'US-LATE1'], [], null, undefined]) {
      const plan = landingPlan() as unknown as { guestHome: Record<string, unknown> }
      if (value === undefined) delete plan.guestHome.linksDecided
      else plan.guestHome.linksDecided = value
      expect(validate(plan), `${JSON.stringify(value)}: ${JSON.stringify(validate.errors)}`).toBe(true)
      expect(() => validateHelper.validateSpecificationBody(slot, JSON.stringify(plan))).not.toThrow()
    }
    const old = oldPlan() as unknown as { guestHome: Record<string, unknown> }
    old.guestHome.linksDecided = ['US-LATE1']
    expect(validate(old), JSON.stringify(validate.errors)).toBe(true)

    const wrong = landingPlan() as unknown as { guestHome: Record<string, unknown> }
    wrong.guestHome.linksDecided = [3]
    expect(validate(wrong)).toBe(false)

    const answered = ScaffoldPlanAnswerSchema.properties.guestHome as unknown as { properties: Record<string, unknown> }
    expect(answered.properties.linksDecided).toBeUndefined()
    expect(answered.properties.links).toBeDefined()
  })

  test('a plan without testimonials validates', () => {
    const plan = landingPlan()
    delete plan.guestHome.testimonials
    expect(validate(plan), JSON.stringify(validate.errors)).toBe(true)
    expect(answer(plan), JSON.stringify(answer.errors)).toBe(true)
  })

  test('refuses a bad anchor, a bad slot and an extra key inside a band', () => {
    const anchor = landingPlan()
    anchor.guestHome.menu = [{ anchor: 'pricing' as never, label: 'Pricing' }]
    expect(validate(anchor)).toBe(false)

    const target = landingPlan()
    target.guestHome.links = [{ slot: 'hero.logo' as never, story: 'US-ABC12' }]
    expect(validate(target)).toBe(false)

    for (const band of ['useCases', 'differentiator', 'approach', 'about'] as const) {
      const plan = landingPlan() as unknown as { guestHome: Record<string, Record<string, unknown>> }
      plan.guestHome[band].extra = 'x'
      expect(validate(plan), band).toBe(false)
    }

    const missing = landingPlan() as unknown as { guestHome: { about: Record<string, unknown> } }
    delete missing.guestHome.about.basis
    expect(validate(missing)).toBe(false)
  })

  test('declares no count as minItems/maxItems, in either schema', () => {
    for (const schema of [ScaffoldPlanSchema, ScaffoldPlanAnswerSchema]) {
      const text = JSON.stringify(schema)
      expect(text).not.toContain('minItems')
      expect(text).not.toContain('maxItems')
    }
    expect(JSON.stringify(ScaffoldPlanAnswerSchema)).toContain('"differentiator"')
  })

  test('exports the landing vocabulary and helpers through the package barrel', () => {
    expect(barrel.landingPlanHelper).toBe(landingPlanHelper)
    expect(barrel.LANDING_GATE_SLOTS).toEqual(['hero.cta', 'hero.secondary', 'closing.primary'])
    for (const anchor of LANDING_ANCHORS) {
      expect(LANDING_BAND_ORDER).toContain(LANDING_ANCHOR_BAND[anchor])
    }
    for (const gated of LANDING_GATE_SLOTS) {
      expect(LANDING_SLOTS).toContain(gated)
    }
  })
})

describe('viable-common - landingBandsOf', () => {
  test('an old stored plan draws the always-on bands; one quote is no testimonials band', () => {
    expect(landingPlanHelper.landingBandsOf(oldPlan().guestHome)).toEqual(['hero', 'features', 'problem'])
  })

  test('a full plan draws every band in the house order', () => {
    expect(landingPlanHelper.landingBandsOf(landingPlan().guestHome)).toEqual(LANDING_BAND_ORDER)
  })

  test('each optional band follows its own presence rule', () => {
    const home = landingPlan().guestHome
    const without = (patch: Partial<GuestHomePlan>) => landingPlanHelper.landingBandsOf({ ...home, ...patch })

    expect(without({ steps: [{ title: '  ', text: 'x' }] })).not.toContain('steps')
    expect(without({ useCases: { cases: home.useCases!.cases.slice(0, 1), basis: BASIS } })).not.toContain('use-cases')
    expect(without({ approach: { principles: home.approach!.principles.slice(0, 2), basis: BASIS } })).not.toContain('approach')
    expect(without({ testimonials: null })).not.toContain('testimonials')
    expect(without({ about: { title: 'Who', text: ' ', basis: BASIS } })).not.toContain('about')
    expect(without({ closing: undefined })).not.toContain('closing')

    // The differentiator: enough contrast rows, OR a title and a text.
    const rowsOnly = { ...home.differentiator!, title: '', text: '' }
    expect(without({ differentiator: rowsOnly })).toContain('differentiator')
    const textOnly = { ...home.differentiator!, contrast: [] }
    expect(without({ differentiator: textOnly })).toContain('differentiator')
    expect(without({ differentiator: { ...rowsOnly, contrast: rowsOnly.contrast.slice(0, 1) } })).not.toContain('differentiator')
  })
})

describe('viable-common - landingMenuOf', () => {
  test('keeps the planned entries in page order with their own labels', () => {
    const home = landingPlan().guestHome
    home.menu = [{ anchor: 'about', label: 'Us' }, { anchor: 'how', label: 'Steps' }, { anchor: 'why', label: ' ' }]

    expect(landingPlanHelper.landingMenuOf(home)).toEqual([
      { anchor: 'how', label: 'Steps' },
      { anchor: 'why', label: 'Why us' },
      { anchor: 'about', label: 'Us' },
    ])
  })

  test('drops entries whose band is absent, and duplicates', () => {
    const home = landingPlan().guestHome
    home.about = null
    home.testimonials = null
    home.menu = [
      { anchor: 'about', label: 'Us' }, { anchor: 'community', label: 'Reviews' },
      { anchor: 'features', label: 'Tools' }, { anchor: 'features', label: 'Again' },
      { anchor: 'approach', label: 'Ways' },
    ]

    expect(landingPlanHelper.landingMenuOf(home)).toEqual([
      { anchor: 'features', label: 'Tools' },
      { anchor: 'approach', label: 'Ways' },
    ])
  })

  test('caps at max, never below the minimum', () => {
    const home = landingPlan().guestHome
    home.menu = [
      { anchor: 'how', label: 'Steps' }, { anchor: 'features', label: 'Tools' },
      { anchor: 'use-cases', label: 'Cases' }, { anchor: 'why', label: 'Why' },
      { anchor: 'approach', label: 'Ways' }, { anchor: 'about', label: 'Us' },
    ]

    expect(landingPlanHelper.landingMenuOf(home).map(entry => entry.anchor)).toEqual(['how', 'features', 'use-cases', 'why'])
    expect(landingPlanHelper.landingMenuOf(home, 3)).toHaveLength(3)
    expect(landingPlanHelper.landingMenuOf(home, 0).map(entry => entry.anchor)).toEqual(['how', 'features'])
  })

  test('pads to two with how, features, then the first present optional band', () => {
    const home = landingPlan().guestHome
    home.menu = null
    expect(landingPlanHelper.landingMenuOf(home)).toEqual([
      { anchor: 'how', label: 'How it works' },
      { anchor: 'features', label: 'Features' },
    ])

    home.menu = [{ anchor: 'about', label: 'Us' }]
    expect(landingPlanHelper.landingMenuOf(home).map(entry => entry.anchor)).toEqual(['how', 'about'])

    const noSteps = landingPlan().guestHome
    noSteps.steps = []
    noSteps.menu = []
    noSteps.labels = { features: 'What you get' }
    expect(landingPlanHelper.landingMenuOf(noSteps)).toEqual([
      { anchor: 'features', label: 'What you get' },
      { anchor: 'use-cases', label: 'Use cases' },
    ])
  })
})

describe('viable-common - homeSlotsOf', () => {
  test('without a gate: the hero and closing pills exist, plus every labelled link and drawn case', () => {
    const home = landingPlan().guestHome
    delete home.gate

    expect(landingPlanHelper.homeSlotsOf(home)).toEqual([
      'hero.cta', 'hero.secondary', 'hero.browse', 'useCase.1', 'useCase.2', 'useCase.3',
      'closing.primary', 'closing.secondary', 'closing.link.1', 'closing.link.2',
    ])
  })

  test('with a usable gate the gated slots are gone; a gate without fields is no gate', () => {
    const home = landingPlan().guestHome
    const slots = landingPlanHelper.homeSlotsOf(home)
    for (const gated of LANDING_GATE_SLOTS) expect(slots).not.toContain(gated)
    expect(slots).toContain('hero.browse')
    expect(slots).toContain('closing.link.1')

    home.gate = { ...home.gate!, fields: [] }
    expect(landingPlanHelper.homeSlotsOf(home)).toContain('hero.cta')
  })

  test('an old stored plan has the primary pill alone; too few cases draw no case slots', () => {
    expect(landingPlanHelper.homeSlotsOf(oldPlan().guestHome)).toEqual(['hero.cta'])

    const home = landingPlan().guestHome
    home.useCases = { cases: home.useCases!.cases.slice(0, 1), basis: BASIS }
    expect(landingPlanHelper.homeSlotsOf(home).some(entry => entry.startsWith('useCase.'))).toBe(false)
  })
})
