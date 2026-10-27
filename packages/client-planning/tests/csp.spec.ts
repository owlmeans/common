import { afterEach, describe, expect, test } from 'bun:test'
import { appSchemaHelper, makeSchemaRegistry } from '@owlmeans/planning'
import type { PlanningAppDeclarations, PlanningService } from '@owlmeans/planning'
import { makePlanningFieldValidator } from '../src/index.js'
import { makeSuite, STORY } from './context.js'
import type { Suite, SuiteOptions } from './context.js'

/** What a browser says when a page's `script-src` lacks `'unsafe-eval'`. */
const REFUSAL = "Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script"

/** The work-management seed's declarations: every type and flow may carry a description. */
const APP: PlanningAppDeclarations = {
  type: { properties: { description: { type: 'string', maxLength: 2000 } } },
  flow: { properties: { description: { type: 'string', maxLength: 2000 } } },
}
const SERVED = appSchemaHelper.merge([APP])

/**
 * The CLIENT runs in a browser page under the publisher's policy — a `document`, and every code
 * generation refused — while the in-process server it calls does not: the suite's transport leaves
 * the page before the server handler runs (`before`) and re-enters it once the server answered
 * (`after`). Armed only by a test, so the suite's own set-up runs outside it.
 */
const makeStrictPage = () => {
  const scope = globalThis as unknown as Record<string, unknown>
  const saved = { Function: scope.Function as FunctionConstructor, eval: scope.eval as typeof eval, error: console.error }
  const counts = { generated: 0, logged: 0 }
  const refuse = (): never => {
    counts.generated++
    throw new EvalError(REFUSAL)
  }
  const refusing = { Function: new Proxy(saved.Function, { construct: refuse, apply: refuse }), eval: new Proxy(saved.eval, { apply: refuse }) }
  let armed = false

  const enter = (): void => {
    scope.document = {}
    scope.Function = refusing.Function
    scope.eval = refusing.eval
    console.error = () => { counts.logged++ }
  }
  const leave = (): void => {
    delete scope.document
    scope.Function = saved.Function
    scope.eval = saved.eval
    console.error = saved.error
  }

  return {
    counts,
    arm: () => { armed = true; counts.generated = 0; counts.logged = 0; enter() },
    disarm: () => { armed = false; leave() },
    hooks: {
      before: async () => { if (armed) leave() },
      after: async () => { if (armed) enter() },
    } satisfies Pick<SuiteOptions, 'before' | 'after'>,
  }
}

const page = makeStrictPage()

/** A seed-like target: the application's declarations registered on the server, as its plugin does. */
const declared = async (opts: SuiteOptions = {}): Promise<Suite> => {
  const suite = await makeSuite({ schemas: false, ...opts, ...page.hooks })
  ;(suite.server as unknown as { planning: () => PlanningService }).planning().use({ name: 'seed', schemas: { app: APP } })

  return suite
}

afterEach(() => page.disarm())

describe('@owlmeans/client-planning — a page under a strict script-src', () => {
  test('the served bundle loads, a model resolves and a form validates without generating code', async () => {
    const suite = await declared()
    const project = await suite.project('Spring')
    const story = await suite.story(project.id!, 'Warm-up', { area: 'stage' })
    const service = suite.client.planning()

    page.arm()
    const registry = await service.loadSchemas()
    expect(registry.app()).toEqual(SERVED!)
    const model = await suite.planning.model(story.id!)
    expect(model.available().map(rule => rule.name)).toContain('start')
    const form = makePlanningFieldValidator(registry.fieldsSchema(STORY))
    expect(form.validateFields({ area: 'stage' }).valid).toBe(true)
    expect(form.validateFields({ area: 2 }).valid).toBe(false)
    page.disarm()

    expect(page.counts).toEqual({ generated: 0, logged: 0 })
  })

  test('an organization layer and a project layer resolve through definitions without generating code', async () => {
    const suite = await declared({ definitions: true })
    const project = await suite.project('Spring')
    const story = await suite.story(project.id!, 'Warm-up', { area: 'stage' })
    const definitions = suite.planning.definitions!

    page.arm()
    const layer = await definitions.registry()
    expect(layer.app()).toEqual(SERVED!)
    expect((await definitions.bundle()).app).toEqual(SERVED!)
    expect((await definitions.registry(project.id!)).app()).toEqual(SERVED!)
    const model = await suite.planning.model(story.id!)
    expect(model.schema().type).toBe(STORY)
    page.disarm()

    expect(page.counts).toEqual({ generated: 0, logged: 0 })
  })

  test('the page really refuses code generation: a native validator cannot be compiled in it', async () => {
    const suite = await declared()
    const bundle = (await suite.client.planning().loadSchemas()).bundle()

    page.arm()
    expect(() => makeSchemaRegistry(bundle).validator(STORY)).toThrow(EvalError)
    page.disarm()

    expect(page.counts.generated).toBeGreaterThan(0)
  })
})
