import { describe, test, expect } from 'bun:test'
import { makeTestContext } from './context.js'
import { appendLogin, makeLoginService } from '../src/login/service.js'
import { resolveLoginMethods, primaryLoginMethod, registerMethodSource } from '../src/login/methods.js'
import { resolveCredit } from '../src/login/credit.js'
import { pluginMethodSource } from '../src/manager/plugins/methods.js'
import { registerAuthPlugin } from '../src/manager/plugins/registry.js'
import type { AuthenticationPlugin } from '../src/manager/plugins/types.js'
import { resumeAction, ResumeAction, loginAttemptError } from '../src/login/resume.js'
import { LoginOutcome } from '../src/login/types.js'
import type {
  LoginEnv, LoginMethod, LoginMethodContext, LoginPlugin, LoginService,
} from '../src/login/types.js'
import type { BasicContext, BasicConfig } from '@owlmeans/context'

/**
 * A hand-written environment descriptor.
 *
 * `LoginEnv` exists precisely so a plugin's decisions can be exercised without a DOM — a stubbed
 * `window` would prove that the stub behaves, not that the cascade does.
 */
const env = (over?: Partial<LoginEnv>): LoginEnv => ({
  hasWindow: true, embedded: false, surrogate: false, hasOpener: false, ...over,
})

const stubPlugin = (over: Partial<LoginPlugin> & { alias: string }): LoginPlugin => ({
  begin: async () => LoginOutcome.Passed,
  authorize: async () => LoginOutcome.Passed,
  complete: async () => LoginOutcome.Passed,
  ...over,
})

const bootstrap = (): [BasicContext<BasicConfig>, LoginService] => {
  const context = makeTestContext()
  const contextual = appendLogin(context)

  return [context, contextual.login()]
}

const methodCtx = (context: BasicContext<BasicConfig>, over?: Partial<LoginEnv>): LoginMethodContext =>
  ({ context, env: env(over) })

const method = (over: Partial<LoginMethod> & { id: string }): LoginMethod => ({
  start: async () => LoginOutcome.Passed, ...over,
})

describe('login plugin host', () => {
  test('the cascade picks the highest-priority plugin whose match holds', () => {
    const service = makeLoginService()
    service.registerPlugin(stubPlugin({ alias: 'default', priority: 0, match: () => true }))
    service.registerPlugin(stubPlugin({
      alias: 'framed', priority: 100, match: candidate => candidate.embedded,
    }))

    expect(service.plugin(env()).alias).toBe('default')
    expect(service.plugin(env({ embedded: true })).alias).toBe('framed')
  })

  test('a plugin with no resume yields Passed, so an ordinary tab is untouched', async () => {
    const [, service] = bootstrap()
    service.registerPlugin(stubPlugin({ alias: 'plain', match: () => true }))

    expect(await service.resume('a-token')).toBe(LoginOutcome.Passed)
  })

  test('a plugin with a resume is asked instead', async () => {
    const [, service] = bootstrap()
    service.registerPlugin(stubPlugin({
      alias: 'framed', match: () => true, resume: async () => LoginOutcome.Handled,
    }))

    expect(await service.resume('a-token')).toBe(LoginOutcome.Handled)
  })

  test('a refusing precondition stops the flow before any plugin runs', async () => {
    const [, service] = bootstrap()
    let started = false
    service.registerPlugin(stubPlugin({
      alias: 'plain', match: () => true,
      begin: async () => { started = true; return LoginOutcome.Handled },
    }))
    service.registerPrecondition({ alias: 'refuse', check: () => false })

    expect(await service.begin({ url: '/dispatcher' })).toBe(LoginOutcome.Gesture)
    expect(started).toBe(false)
  })

  test('a passing precondition lets the plugin run', async () => {
    const [, service] = bootstrap()
    service.registerPlugin(stubPlugin({
      alias: 'plain', match: () => true, begin: async () => LoginOutcome.Handled,
    }))
    service.registerPrecondition({ alias: 'allow', check: () => true })

    expect(await service.begin({ url: '/dispatcher' })).toBe(LoginOutcome.Handled)
  })

  test('a plugin with no logout still ends the session it was asked to end', async () => {
    const [context, service] = bootstrap()
    context.configure()
    await context.init()
    service.registerPlugin(stubPlugin({ alias: 'plain', match: () => true }))
    const auth = context.service<{ token?: string, update: (t?: string) => Promise<void> }>('auth')

    expect(await service.logout({ url: '' })).toBe(LoginOutcome.Passed)
    expect(auth.token == null || auth.token === '').toBe(true)
  })
})

describe('login method resolution', () => {
  test('methods sort by declared order, ties by id', () => {
    const context = makeTestContext()
    const source = {
      alias: 'test', list: () => [
        method({ id: 'b', order: 10 }), method({ id: 'a', order: 10 }), method({ id: 'z', order: 1 }),
      ],
    }

    const resolved = resolveLoginMethods(methodCtx(context), undefined, [source])

    expect(resolved.map(item => item.id)).toEqual(['z', 'a', 'b'])
  })

  test('a restricted method is not offered until the configuration asks for it', () => {
    const context = makeTestContext()
    const source = {
      alias: 'test', list: () => [method({ id: 'ordinary' }), method({ id: 'operator', restricted: true })],
    }

    expect(resolveLoginMethods(methodCtx(context), undefined, [source]).map(m => m.id))
      .toEqual(['ordinary'])
    expect(resolveLoginMethods(
      methodCtx(context), { overrides: { operator: { enabled: true } } }, [source]
    ).map(m => m.id).sort()).toEqual(['operator', 'ordinary'])
    expect(resolveLoginMethods(
      methodCtx(context), { methods: ['operator'] }, [source]
    ).map(m => m.id)).toEqual(['operator'])
  })

  test('an explicit list is both the filter and the order', () => {
    const context = makeTestContext()
    const source = {
      alias: 'test', list: () => [method({ id: 'a' }), method({ id: 'b' }), method({ id: 'c' })],
    }

    expect(resolveLoginMethods(methodCtx(context), { methods: ['c', 'a'] }, [source]).map(m => m.id))
      .toEqual(['c', 'a'])
  })

  test('a source that throws is skipped rather than taking the screen down', () => {
    const context = makeTestContext()
    const broken = { alias: 'broken', list: () => { throw new Error('misconfigured') } }
    const working = { alias: 'working', list: () => [method({ id: 'ok' })] }

    expect(resolveLoginMethods(methodCtx(context), undefined, [broken, working]).map(m => m.id))
      .toEqual(['ok'])
  })

  test('the primary method is the first emphasised one, else the first', () => {
    expect(primaryLoginMethod([
      method({ id: 'a' }), method({ id: 'b', emphasis: 'primary' }),
    ])?.id).toBe('b')
    expect(primaryLoginMethod([method({ id: 'a' })])?.id).toBe('a')
    expect(primaryLoginMethod([])).toBeNull()
  })

  test('a globally registered source reaches the resolver', () => {
    const context = makeTestContext()
    registerMethodSource({ alias: 'global-test', list: () => [method({ id: 'global' })] })

    expect(resolveLoginMethods(methodCtx(context)).map(m => m.id)).toContain('global')
  })
})

describe('the credit line', () => {
  const year = new Date().getFullYear()

  test('is a copyright NOTICE — the mark and the year, not a bare name', () => {
    expect(resolveCredit({ product: 'OwlMeans', organization: 'OwlMeans' }).line)
      .toBe(`© ${year} OwlMeans`)
  })

  test('pairs the product with the notice when the product is not the holder', () => {
    expect(resolveCredit({ product: 'Taskly', organization: 'Acme' }).line)
      .toBe(`Taskly — © ${year} Acme`)
  })

  test('falls back to the entity slug when the organization has no name', () => {
    expect(resolveCredit({ product: 'Taskly', entity: 'acme-7f2' }).line)
      .toBe(`Taskly — © ${year} acme-7f2`)
  })

  test('a first year in the past makes the notice a range', () => {
    expect(resolveCredit({ organization: 'Acme', since: 2019 }).line).toBe(`© 2019–${year} Acme`)
    // The current year is not a range, and neither is one a skewed clock puts ahead of it.
    expect(resolveCredit({ organization: 'Acme', since: year }).line).toBe(`© ${year} Acme`)
    expect(resolveCredit({ organization: 'Acme', since: year + 5 }).line).toBe(`© ${year} Acme`)
  })

  test('an explicit holder is who the notice names', () => {
    expect(resolveCredit({ product: 'Taskly', organization: 'Taskly', holder: 'Acme Inc.' }).line)
      .toBe(`Taskly — © ${year} Acme Inc.`)
  })

  test('an owner\'s own wording is used verbatim', () => {
    expect(resolveCredit({ organization: 'Acme', copyright: '© Acme. All rights reserved.' }).line)
      .toBe('© Acme. All rights reserved.')
  })

  test('switching the notice off leaves the bare pairing it used to be', () => {
    expect(resolveCredit({ product: 'Taskly', organization: 'Acme', copyright: false }).line)
      .toBe('Taskly — Acme')
    expect(resolveCredit({ product: 'Taskly', copyright: false }).line).toBe('Taskly')
  })

  test('a literal line replaces the composition entirely', () => {
    expect(resolveCredit({ product: 'Taskly', organization: 'Acme', line: '© Acme' }).line)
      .toBe('© Acme')
  })

  test('nobody to name is nothing to render', () => {
    expect(resolveCredit().line).toBeNull()
  })

  test('an EMPTY value is unset, not a value', () => {
    // Exactly what a platform delivers for branding it does not have: every key present, the
    // undelivered ones empty. `??` does not fall through an empty string, so the organization
    // used to win the chain and compose "pisteva — " with nothing after the dash.
    expect(resolveCredit({}, { name: 'pisteva', organization: '', entity: '' }).line)
      .toBe(`© ${year} pisteva`)
    expect(resolveCredit({ line: '', product: '', organization: '' }, { name: 'Taskly' }).line)
      .toBe(`© ${year} Taskly`)
    expect(resolveCredit({ copyright: '  ' }, { name: 'Taskly' }).line).toBe(`© ${year} Taskly`)
    expect(resolveCredit({}, {}, '').line).toBeNull()
  })

  test('the platform credit is on unless it is switched off', () => {
    expect(resolveCredit().poweredBy).toBe(true)
    expect(resolveCredit({ poweredBy: false }).poweredBy).toBe(false)
  })
})

describe('the authentication-plugin method source', () => {
  const plugin = (
    over: Partial<AuthenticationPlugin> & { type: string }
  ): AuthenticationPlugin => ({ Implementation: () => () => null, ...over })

  const offered = (context: BasicContext<BasicConfig>): string[] =>
    pluginMethodSource.list(methodCtx(context)).map(item => item.id)

  test('a plugin that declares no method is not a way to sign in', () => {
    const context = makeTestContext()
    registerAuthPlugin(plugin({ type: 'step-in-a-flow' }))
    registerAuthPlugin(plugin({ type: 'offerable', method: {} }))

    expect(offered(context)).toContain('offerable')
    expect(offered(context)).not.toContain('step-in-a-flow')
  })

  test('a plugin that needs a renderer nobody assigned is left off the screen', () => {
    const context = makeTestContext()
    // Exactly the state an app is in when it imported the plugin host but not a panel package:
    // the plugin is registered, and mounting its screen throws.
    registerAuthPlugin(plugin({ type: 'needs-ui', method: {}, requiresRenderer: true }))

    expect(offered(context)).not.toContain('needs-ui')

    registerAuthPlugin(plugin({
      type: 'needs-ui', method: {}, requiresRenderer: true, Renderer: () => null,
    }))

    expect(offered(context)).toContain('needs-ui')
  })

  test('a plugin whose own wiring is absent says so and is left off', () => {
    const context = makeTestContext()
    registerAuthPlugin(plugin({
      type: 'needs-wiring', method: { available: ctx => ctx.context.hasService('never-appended') },
    }))

    expect(offered(context)).not.toContain('needs-wiring')
  })
})

describe('a finished sign-in attempt', () => {
  test('reports every outcome that leaves the user on the screen', () => {
    // The regression: a method that could not build an authorization URL returned `Passed`, the
    // screen rendered nothing, and the button read as broken. `Passed` is a valid answer TO A
    // DISPATCHER, which has a continuation; a screen does not.
    expect(loginAttemptError(LoginOutcome.Passed)).toBe('login.error.failed')
    expect(loginAttemptError(LoginOutcome.Failed)).toBe('login.error.failed')
    expect(loginAttemptError(LoginOutcome.Gesture)).toBe('login.error.blocked')
  })

  test('says nothing when the attempt actually went somewhere', () => {
    expect(loginAttemptError(LoginOutcome.Handled)).toBeNull()
    expect(loginAttemptError(LoginOutcome.Redirected)).toBeNull()
    expect(loginAttemptError(LoginOutcome.Orphaned)).toBeNull()
    expect(loginAttemptError(null)).toBeNull()
  })
})

describe('resume outcomes', () => {
  test('map to exactly one action each', () => {
    expect(resumeAction(LoginOutcome.Handled)).toBe(ResumeAction.Stop)
    expect(resumeAction(LoginOutcome.Redirected)).toBe(ResumeAction.Stop)
    expect(resumeAction(LoginOutcome.Orphaned)).toBe(ResumeAction.Render)
    expect(resumeAction(LoginOutcome.Failed)).toBe(ResumeAction.Render)
    expect(resumeAction(LoginOutcome.Gesture)).toBe(ResumeAction.Render)
    // The ordinary tab: keep the session and carry on. This is the one that must never change.
    expect(resumeAction(LoginOutcome.Passed)).toBe(ResumeAction.Navigate)
  })
})
