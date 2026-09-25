import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { validateSpecificationBody } from '@owlmeans/planning'
import { ProjectArea } from '../src/areas/consts.js'
import { ViableSpecCategory, VIABLE_PROJECT_SLOTS } from '../src/planning/index.js'
import { BENTO_FRAGMENT_KINDS, LANDING_GATE_FIELD_KINDS, WidgetKind } from '../src/scaffold/consts.js'
import { ScaffoldPlanAnswerSchema, ScaffoldPlanSchema } from '../src/scaffold/schemas.js'
import type { ScaffoldPlan } from '../src/scaffold/types.js'

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
    expect(() => validateSpecificationBody(slot, JSON.stringify(oldPlan()))).not.toThrow()
  })

  test('a plan carrying every new field validates', () => {
    expect(validate(newPlan()), JSON.stringify(validate.errors)).toBe(true)
    expect(() => validateSpecificationBody(slot, JSON.stringify(newPlan()))).not.toThrow()
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
    expect(() => validateSpecificationBody(slot, JSON.stringify(stored))).not.toThrow()
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
