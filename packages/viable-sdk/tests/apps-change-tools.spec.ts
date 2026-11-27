import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import { ApiStatusError } from '@owlmeans/api'
import {
  ConnectHarness, ConnectLlm, ConnectTarget, TriageKind, type ConnectAppsChangeView, type ConnectProjectStatus,
  type ConnectRequestView,
} from '@owlmeans/viable-common'

import { appsChangeToolHelper } from '../src/tools/apps-change.js'
import { APPS_CHANGE_UNSUPPORTED } from '../src/tools/apps-change/consts.js'
import { attendedCallHelper } from '../src/tools/attended.js'
import { cardsToolHelper } from '../src/tools/cards.js'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { ToolHostKind } from '../src/tools/consts.js'
import { createInflightCalls } from '../src/tools/inflight.js'
import { registerCatalogue } from '../src/tools/mcp.js'
import { listingProfile, localPluginProfile } from '../src/tools/profile/listing.js'
import { refusalHelper } from '../src/tools/refusal.js'
import type { McpServerLike, McpToolAnswer, ToolDeps, ToolHost } from '../src/tools/types.js'

/**
 * The three tools that change a project's APP STRUCTURE — add_app, add_area, bind_area — on every host:
 * only the named fields reach the platform, a settled change answers what changed and the apps as they
 * stand, a slow one answers that it goes on (a stdio host told that a repeat waits on it, a hosted one
 * not), an identical repeat joins the running change, a platform without the routes and a connector
 * without the member say so, and the platform's refusal is phrased. And modify_project's request is
 * attended the same way: a repeat of the same prompt collects what the first one became.
 */

const hostOf = (kind: ToolHostKind, target: ConnectTarget, extra: Partial<ToolHost> = {}): ToolHost => ({
  kind, target, llm: ConnectLlm.Cloud, harness: ConnectHarness.ClaudeCode, hasExecutor: kind === ToolHostKind.Stdio, ...extra,
})

const CLOUD = hostOf(ToolHostKind.Stdio, ConnectTarget.Cloud)
const LOCAL = hostOf(ToolHostKind.Stdio, ConnectTarget.Local)
const HOSTED = hostOf(ToolHostKind.Http, ConnectTarget.Cloud)

const STATUS = { project: { id: 'p1', name: 'Deals', alias: 'deals', status: 'confirmed' }, agent: { locked: false } } as unknown as ConnectProjectStatus

const CHANGED: ConnectAppsChangeView = {
  projectId: 'p1', local: false, recorded: true,
  summary: 'Added the app "partners" at /partners (api /partners/api) serving partner-portal.',
  warnings: ['the restricted areas\' permissions could not be declared on the sign-in client'],
  apps: [
    { name: 'main', mount: '', areas: ['guest', 'user'], main: true, url: 'https://deals.example/' },
    { name: 'partners', mount: 'partners', areas: ['partner-portal'], main: false, url: 'https://deals.example/partners' },
  ],
  areas: [
    { key: 'guest', kind: 'guest', segment: '', app: 'main', path: '/' },
    { key: 'partner-portal', kind: 'user', segment: 'partner-portal', app: 'partners', path: '/partners', label: 'Partner portal' },
  ],
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })

  return { promise, resolve }
}

const depsOf = (host: ToolHost, api: Record<string, unknown>, extra: Partial<ToolDeps> = {}): ToolDeps => ({
  host, api, session: async () => ({} as never), currentSession: () => null, attached: () => 'p1', attach: () => undefined,
  log: () => undefined, ...extra,
} as unknown as ToolDeps)

const run = async (name: string, args: Record<string, unknown>, deps: ToolDeps) =>
  await catalogue.find(tool => tool.name === name)!.run(args, deps)

/** Registers the catalogue on a recording server — the MCP boundary a host calls. */
const boundary = (deps: ToolDeps) => {
  const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<McpToolAnswer>>()
  const server: McpServerLike = { registerTool: (name, _config, cb) => { callbacks.set(name, cb) } }
  registerCatalogue(server, deps)

  return async (name: string, args: Record<string, unknown>) => await callbacks.get(name)!(args)
}

const textOf = (answer: McpToolAnswer): string => answer.content.map(part => part.text).join('\n')

describe('viable-sdk — the app structure tools are offered everywhere', () => {
  test('on every host and target and under the listing profiles; writes, never destructive in the catalogue', () => {
    for (const host of [CLOUD, LOCAL, HOSTED, { ...HOSTED, profile: listingProfile }, { ...LOCAL, profile: localPluginProfile }]) {
      const offered = catalogueHelper.visibleTools(host).map(tool => tool.name)
      expect([host.kind, host.target, ['add_app', 'add_area', 'bind_area'].every(name => offered.includes(name))])
        .toEqual([host.kind, host.target, true])
    }
    for (const name of ['add_app', 'add_area', 'bind_area']) {
      const tool = catalogueHelper.toolByName(name)!
      expect([name, tool.annotations.readOnlyHint, tool.annotations.destructiveHint]).toEqual([name, false, false])
      expect(tool.description).toContain('credits')
      expect(tool.description).toContain('project_apps')
    }
    // The listing: an addition repeats (refused the second time), a move with nothing built sets a value.
    const listed = new Map(catalogueHelper.visibleTools({ ...HOSTED, profile: listingProfile }).map(tool => [tool.name, tool]))
    expect(['add_app', 'add_area', 'bind_area'].map(name => [name, listed.get(name)!.annotations.destructiveHint, listed.get(name)!.annotations.idempotentHint]))
      .toEqual([['add_app', false, false], ['add_area', false, false], ['bind_area', false, true]])
  })
})

describe('viable-sdk — add_app, add_area, bind_area', () => {
  test('only the named fields reach the platform, and a settled change answers what changed and the apps', async () => {
    const calls: Array<[string, unknown]> = []
    const apps = {
      add: async (id: string, body: unknown) => { calls.push(['add', [id, body]]); return CHANGED },
      addArea: async (id: string, body: unknown) => { calls.push(['addArea', [id, body]]); return CHANGED },
      bindArea: async (id: string, body: unknown) => { calls.push(['bindArea', [id, body]]); return CHANGED },
    }
    const deps = depsOf(CLOUD, { apps })

    const added = await run('add_app', {
      name: 'partners', mount: 'partners', newArea: { key: 'partner-portal', kind: 'user', label: ' Partner portal ', extra: 1 },
    }, deps)
    await run('add_area', { projectId: 'p2', key: 'field-ops', kind: 'operator', app: 'backoffice', restricted: true }, deps)
    await run('bind_area', { area: 'field-ops', app: 'admin' }, deps)

    expect(calls).toEqual([
      ['add', ['p1', { name: 'partners', mount: 'partners', newArea: { key: 'partner-portal', kind: 'user', label: 'Partner portal' } }]],
      ['addArea', ['p2', { key: 'field-ops', kind: 'operator', restricted: true, app: 'backoffice' }]],
      ['bindArea', ['p1', { area: 'field-ops', app: 'admin' }]],
    ])
    expect(added.isError).toBeUndefined()
    expect(added.text).toStartWith(`${CHANGED.summary}\nNot everything went through: ${CHANGED.warnings![0]}.\n`)
    expect(added.text).toContain('  partners · /partners · areas partner-portal')
    expect(added.text).toContain('  partner-portal (user) · partners · /partners · segment partner-portal · Partner portal')
    expect(added.structured).toEqual(CHANGED)
  })

  test('an app with neither areas nor a new area is refused before the platform is asked', async () => {
    const result = await run('add_app', { name: 'partners' }, depsOf(CLOUD, { apps: { add: async () => { throw new Error('asked') } } }))

    expect(result.isError).toBe(true)
    expect(result.text).toContain('Name the areas the application takes over')
  })

  test('a connector without the member, and a platform without the routes, say so and name modify_project', async () => {
    expect(await run('bind_area', { area: 'user', app: 'admin' }, depsOf(CLOUD, {}))).toEqual({ text: APPS_CHANGE_UNSUPPORTED, isError: true })

    const older = depsOf(CLOUD, {
      apps: { bindArea: async () => { throw Object.assign(new Error('Route POST:/connect/project/p1/apps/areas/bind not found'), { responseStatus: 404 }) } },
      project: { status: async () => STATUS },
    })
    expect(await run('bind_area', { area: 'user', app: 'admin' }, older)).toEqual({ text: APPS_CHANGE_UNSUPPORTED, isError: true })
    expect(APPS_CHANGE_UNSUPPORTED).toContain('modify_project')
  })

  test('the platform\'s refusal is phrased with its own sentence, and nothing was changed', async () => {
    const sentence = 'Not moved: "user" already has stories built — a built area stays in the app it was built in.'
    const refusal = ResilientError.ensure(ResilientError.marshal(
      Object.assign(new ResilientError('AppsChangeRefusedErrorViableAgentCommonError', `viable-agent-common:slot-app:change-refused:${sentence}`), { httpStatus: 409 }),
      { includeStack: false },
    ).message)
    const deps = depsOf(CLOUD, { apps: { bindArea: async () => { throw refusal } }, project: { status: async () => STATUS } })

    const result = await boundary(deps)('bind_area', { area: 'user', app: 'admin' })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe(`${sentence} Nothing was changed — project_apps lists the applications and areas as they stand.`)
    expect(refusalHelper.refusalPhrase(new Error('viable-agent-common:slot-app:change-refused:')))
      .toContain('The platform refused that change of the project\'s applications.')
  })

  test('a slow change answers that it goes on; a repeat with the same arguments joins it, asking nothing more', async () => {
    const pending = deferred<ConnectAppsChangeView>()
    let asked = 0
    const deps = depsOf(CLOUD, { apps: { add: async () => { asked++; return await pending.promise } } }, { inflight: createInflightCalls() })
    const change = async () => await appsChangeToolHelper.change(deps, {
      tool: 'add_app', args: { name: 'partners', areas: ['user'] }, projectId: 'p1', doing: 'adding the application "partners"',
      apply: async api => await api.add('p1', { name: 'partners', areas: ['user'] }), waitMs: 20,
    })

    const first = await change()
    expect(first.isError).toBeUndefined()
    expect(first.text).toContain('The platform is still adding the application "partners": the project stays locked until it is done')
    expect(first.text).toContain('project_apps { "projectId": "p1" }')
    expect(first.text).toContain('Calling add_app again with the same arguments waits on the same change')
    expect(first.structured).toEqual({ running: 'add_app', projectId: 'p1' })

    const second = await change()
    expect(second.structured).toEqual({ running: 'add_app', projectId: 'p1' })

    pending.resolve(CHANGED)
    await Bun.sleep(5)
    const third = await change()
    expect(third.structured).toEqual(CHANGED)
    expect(asked).toBe(1)

    // Collected once: the same arguments after that are a new change.
    await change()
    expect(asked).toBe(2)
  })

  test('a hosted host is never told to call again — it holds nothing between requests', async () => {
    const never = new Promise<ConnectAppsChangeView>(() => undefined)
    const deps = depsOf(HOSTED, { apps: { bindArea: async () => await never } })

    const result = await appsChangeToolHelper.change(deps, {
      tool: 'bind_area', args: { area: 'field-ops', app: 'admin' }, projectId: 'p1', doing: 'moving the area "field-ops" to "admin"',
      apply: async api => await api.bindArea('p1', { area: 'field-ops', app: 'admin' }), waitMs: 10,
    })

    expect(result.text).toContain('The platform is still moving the area "field-ops" to "admin"')
    expect(result.text).not.toContain('again')
    expect(result.structured).toEqual({ running: 'bind_area', projectId: 'p1' })
  })

  test('the listing presentation answers the change and the still-running answer in one declared shape', async () => {
    const listed = depsOf({ ...HOSTED, profile: listingProfile }, { apps: { addArea: async () => CHANGED } })
    const answer = await boundary(listed)('add_area', { key: 'partner-portal', kind: 'user' })

    expect(answer.isError).toBeUndefined()
    expect(answer.structuredContent).toMatchObject({
      projectId: 'p1', recorded: true, summary: CHANGED.summary, warnings: CHANGED.warnings,
      apps: [{ name: 'main', path: '/' }, { name: 'partners', path: '/partners', areas: ['partner-portal'] }],
    })
  })
})

describe('viable-sdk — an attended call', () => {
  test('in the delegated mode it simply runs: the handover attends every tool', async () => {
    const delegated = depsOf({ ...CLOUD, llm: ConnectLlm.Local }, {})
    const result = await attendedCallHelper.attend(delegated, {
      tool: 'modify_project', args: { prompt: 'x' }, waitMs: 1,
      run: async () => { await Bun.sleep(20); return { text: 'ran' } },
      pending: async () => ({ text: 'pending' }),
    })

    expect(result).toEqual({ text: 'ran' })
  })

  test('a refusal settles as the tool\'s phrased refusal, never a throw', async () => {
    const deps = depsOf(CLOUD, {})
    const result = await attendedCallHelper.attend(deps, {
      tool: 'add_app', args: {}, waitMs: 1_000,
      run: async () => { throw new ApiStatusError(409) },
      pending: async () => ({ text: 'pending' }),
    })

    expect(result.isError).toBe(true)
  })
})

describe('viable-sdk — modify_project collects a slow request', () => {
  test('a repeat of the same prompt collects what the first request became, sending nothing more', async () => {
    // The tool's own deadline is the request's (38 s): the attended helper is exercised directly with a
    // short one, through the very run modify_project hands it.
    const view: ConnectRequestView = { kind: TriageKind.Fix }
    const pending = deferred<ConnectRequestView>()
    let requests = 0
    const deps = depsOf(CLOUD, {
      project: { status: async () => STATUS, request: async () => { requests++; return await pending.promise } },
    }, { inflight: createInflightCalls() })
    const ask = async () => await attendedCallHelper.attend(deps, {
      tool: 'modify_project', args: { prompt: 'Move the field-ops area into the admin app' }, waitMs: 20,
      run: async () => ({ text: cardsToolHelper.renderRequest(await (deps.api.project.request('p1', 'x'))), structured: { request: view } }),
      pending: async rejoinable => ({ text: rejoinable ? 'still reading — call again' : 'still reading' }),
    })

    expect((await ask()).text).toBe('still reading — call again')
    pending.resolve(view)
    await Bun.sleep(5)
    const collected = await ask()
    expect(collected.text).toContain('small FIX')
    expect(requests).toBe(1)
  })

  test('apps — and any kind this connector has not heard of — reads as an open-ended change under way', () => {
    for (const kind of [TriageKind.Apps, 'something-new']) {
      expect(cardsToolHelper.renderRequest({ kind } as ConnectRequestView)).toContain('small FIX')
    }
  })

  test('modify_project answers the request it settled within its deadline, as before', async () => {
    const deps = depsOf(CLOUD, { project: { status: async () => STATUS, request: async () => ({ kind: TriageKind.Question }) } })
    const answer = await run('modify_project', { prompt: 'How are deals sorted?' }, deps)

    expect(answer.text).toContain('QUESTION')
    expect(answer.structured).toMatchObject({ request: { kind: TriageKind.Question }, project: STATUS })
  })
})
