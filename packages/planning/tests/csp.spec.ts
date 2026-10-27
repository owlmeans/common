import { afterEach, describe, expect, test } from 'bun:test'
import { IntrinsicStatus, WorkcardKind } from '../src/index.js'
import type {
  PlanningAppDeclarations, PlanningSchemaBundle, ProjectTypeSchema, StatusFlowSchema, WorkcardTypeSchema,
} from '../src/index.js'
import { appSchemaHelper } from '../src/helpers/app.js'
import { scopedSchemaHelper } from '../src/helpers/scoped.js'
import { makeSchemaRegistry } from '../src/registry.js'

/** What a browser says when a page's `script-src` lacks `'unsafe-eval'`. */
const REFUSAL = "Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script"

/** The work-management seed's declarations: every type and flow may carry a description. */
const APP: PlanningAppDeclarations = {
  type: { properties: { description: { type: 'string', maxLength: 2000 } } },
  flow: { properties: { description: { type: 'string', maxLength: 2000 } } },
}

const WORK: StatusFlowSchema = {
  id: 'wm:work-flow', version: 1, overridable: true, app: { description: 'Day-to-day work' },
  statuses: [{ key: 'open', intrinsic: IntrinsicStatus.Planned, initial: true }, { key: 'done', intrinsic: IntrinsicStatus.Closed }],
  transitions: [{ name: 'finish', from: ['open'], to: 'done' }],
}

const TASK: WorkcardTypeSchema = {
  type: 'wm:task', kind: WorkcardKind.Card, version: 1, flows: [WORK.id], specifications: [], overridable: true,
  app: { description: 'Work items' },
  fields: { type: 'object', properties: { priority: { type: 'string', enum: ['low', 'high'] } }, required: ['priority'] },
}

const WORKSPACE: ProjectTypeSchema = {
  type: 'wm:workspace', kind: WorkcardKind.Project, version: 1, fields: { type: 'object' },
  flows: [WORK.id], specifications: [], cardTypes: [TASK.type],
}

/**
 * A browser page under the publisher's policy: a `document` exists and every code generation is
 * refused, the way a `script-src` without `'unsafe-eval'` refuses `new Function` and `eval`.
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

  return {
    counts,
    enter: () => {
      scope.document = {}
      scope.Function = refusing.Function
      scope.eval = refusing.eval
      console.error = () => { counts.logged++ }
    },
    leave: () => {
      delete scope.document
      scope.Function = saved.Function
      scope.eval = saved.eval
      console.error = saved.error
    },
  }
}

const page = makeStrictPage()

/** What a server serves: compiled there, then a JSON body — no object a page could share with it. */
const served = (): PlanningSchemaBundle => JSON.parse(JSON.stringify(makeSchemaRegistry({
  version: 1, types: [WORKSPACE, TASK], flows: [WORK], app: appSchemaHelper.merge([APP]),
}).bundle())) as PlanningSchemaBundle

afterEach(() => page.leave())

describe('planning schemas — a page under a strict script-src', () => {
  test('a registry builds, loads and merges served declarations without generating code', () => {
    const bundle = served()
    const scoped = JSON.parse(JSON.stringify(scopedSchemaHelper.resolveScopedBundle(bundle, [], { entityId: 'org-1' })))
    page.counts.generated = 0
    page.counts.logged = 0

    page.enter()
    const registry = makeSchemaRegistry(bundle)
    expect(registry.app()).toEqual(bundle.app!)
    registry.load(bundle)
    expect(registry.bundle()).toEqual(bundle)
    expect(appSchemaHelper.merge([bundle.app])).toEqual(bundle.app!)
    appSchemaHelper.assertDeclarations(bundle.app!)
    const layer = scopedSchemaHelper.scopedRegistryOf(scoped)
    expect(layer.app()).toEqual(bundle.app!)
    expect((layer.type(TASK.type) as WorkcardTypeSchema).app).toEqual({ description: 'Work items' })
    expect(layer.fieldsSchema(TASK.type)).toEqual(TASK.fields)
    page.leave()

    expect(page.counts).toEqual({ generated: 0, logged: 0 })
  })

  test('the closed form is still refused in a page; only the compile is the server\'s', () => {
    const bundle = served()
    const uncompilable = { type: { properties: { a: { type: 'nope' } } } } as unknown as PlanningAppDeclarations
    expect(() => appSchemaHelper.assertDeclarations(uncompilable)).toThrow('app:type:')

    page.enter()
    expect(() => appSchemaHelper.assertDeclarations({ card: { properties: { 'a.b': {} } } })).toThrow('app:card:name:a.b')
    expect(() => makeSchemaRegistry({ ...bundle, app: { type: { properties: { a: {} }, required: ['b'] } } }))
      .toThrow('app:type:required:b')
    expect(() => appSchemaHelper.assertDeclarations(uncompilable)).not.toThrow()
    page.leave()
  })

  test('the page really refuses code generation: a native validator cannot be compiled in it', () => {
    const bundle = served()
    page.counts.generated = 0

    page.enter()
    expect(() => makeSchemaRegistry(bundle).validator(TASK.type)).toThrow(EvalError)
    page.leave()

    expect(page.counts.generated).toBeGreaterThan(0)
  })
})
