import { afterEach, describe, expect, test } from 'bun:test'
import fse from 'fs-extra'
import path from 'node:path'
import {
  CONNECT_RUN_FILE, ConnectHarness, ConnectLlm, ConnectTarget, type ConnectAppsView, type ConnectProjectStatus,
} from '@owlmeans/viable-common'
import type { Workcard } from '@owlmeans/planning'

import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { ToolHostKind } from '../src/tools/consts.js'
import { registerCatalogue } from '../src/tools/mcp.js'
import { listingProfile, localPluginProfile } from '../src/tools/profile/listing.js'
import { storyHelper } from '../src/tools/stories.js'
import type { McpServerLike, McpToolAnswer, ToolDeps, ToolHost } from '../src/tools/types.js'
import { makeTargetTree } from './apps-fixture.js'

/**
 * The two app tools on every host and target, their refusals, and what stays exactly as it was: a
 * story line or a story status names an app only when its card names an area, and `project_status` /
 * `session_status` answer byte for byte what they always answered.
 */

const hostOf = (kind: ToolHostKind, target: ConnectTarget, extra: Partial<ToolHost> = {}): ToolHost => ({
  kind, target, llm: ConnectLlm.Cloud, harness: ConnectHarness.ClaudeCode, hasExecutor: kind === ToolHostKind.Stdio, ...extra,
})

const CLOUD = hostOf(ToolHostKind.Stdio, ConnectTarget.Cloud)
const LOCAL = hostOf(ToolHostKind.Stdio, ConnectTarget.Local)
const HOSTED = hostOf(ToolHostKind.Http, ConnectTarget.Cloud)

const notFound = (message = 'Route GET:/connect/project/p1/apps not found'): Error =>
  Object.assign(new Error(message), { responseStatus: 404 })

const SPLIT: ConnectAppsView = {
  projectId: 'p1', local: false, recorded: true,
  apps: [
    { name: 'main', mount: '', areas: ['guest', 'user'], main: true, url: 'https://shop.example/', build: 'ok', backend: 'running' },
    {
      name: 'admin', mount: 'admin', areas: ['admin'], main: false, url: 'https://shop.example/admin',
      build: 'ok', backend: 'crashed', cause: 'TypeError: x is undefined', causeKind: 'start',
    },
    { name: 'backoffice', mount: 'backoffice', areas: ['operator'], main: false, build: 'ok', backend: 'running' },
  ],
  worker: { phase: 'running' },
}

interface Recorded { calls: Array<[string, unknown[]]> }

const depsOf = (host: ToolHost, api: Record<string, unknown>, extra: Partial<ToolDeps> = {}): ToolDeps & Recorded => {
  const calls: Array<[string, unknown[]]> = []
  const record = (prefix: string, value: unknown): unknown => typeof value === 'function'
    ? async (...args: unknown[]) => { calls.push([prefix, args]); return await (value as (...a: unknown[]) => unknown)(...args) }
    : value != null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, member]) => [key, record(`${prefix}${prefix === '' ? '' : '.'}${key}`, member)]))
      : value

  return {
    host, api: record('', api), calls,
    session: async () => ({} as never), currentSession: () => null, attached: () => 'p1', attach: () => undefined,
    log: () => undefined, ...extra,
  } as unknown as ToolDeps & Recorded
}

const run = async (name: string, args: Record<string, unknown>, deps: ToolDeps) =>
  await catalogue.find(tool => tool.name === name)!.run(args, deps)

/** Registers the catalogue on a recording server — the MCP boundary, where a refusal is phrased. */
const boundary = (deps: ToolDeps) => {
  const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<McpToolAnswer>>()
  const server: McpServerLike = { registerTool: (name, _config, cb) => { callbacks.set(name, cb) } }
  registerCatalogue(server, deps)

  return async (name: string, args: Record<string, unknown>) => await callbacks.get(name)!(args)
}

describe('viable-sdk — a project\'s applications, as tools', () => {
  const roots: string[] = []
  afterEach(async () => { while (roots.length > 0) await fse.remove(roots.pop()!) })

  test('both tools are offered on every host and target, under the listing profiles too', () => {
    for (const host of [CLOUD, LOCAL, HOSTED, { ...HOSTED, profile: listingProfile }, { ...LOCAL, profile: localPluginProfile }]) {
      const offered = catalogueHelper.visibleTools(host).map(tool => tool.name)
      expect([host.kind, host.target, offered.includes('project_apps'), offered.includes('restart_project_app')])
        .toEqual([host.kind, host.target, true, true])
    }
    const restart = catalogueHelper.toolByName('restart_project_app')!
    expect([restart.annotations.readOnlyHint, restart.annotations.destructiveHint]).toEqual([false, false])
    expect(catalogueHelper.toolByName('project_apps')!.annotations.readOnlyHint).toBe(true)
  })

  test('project_apps lists every app with its path, areas, interface and server, and names the one to restart', async () => {
    const deps = depsOf(CLOUD, { project: { apps: async () => SPLIT } })
    const result = await run('project_apps', {}, deps)

    expect(result.isError).toBeUndefined()
    expect(result.text).toContain('3 applications, each under its own path')
    expect(result.text).toContain('  main · / · areas guest, user · interface ok · server running · https://shop.example/')
    expect(result.text).toContain('  admin · /admin · areas admin · interface ok · server crashed · https://shop.example/admin\n      start: TypeError: x is undefined')
    expect(result.text).toContain('worker: running')
    expect(result.text).toContain('next: restart_project_app { "projectId": "p1", "app": "admin" }')
    expect(result.structured).toEqual(SPLIT)
    expect(deps.calls).toEqual([['project.apps', ['p1']]])
  })

  test('a platform older than the route reports one application, main — only once the project itself answers', async () => {
    const status = async () => ({ project: { id: 'p1' } })
    const older = await run('project_apps', {}, depsOf(CLOUD, { project: { apps: async () => { throw notFound() }, status } }))
    expect(older.text).toStartWith('This platform reports one application (main)')
    expect(older.structured).toMatchObject({ projectId: 'p1', recorded: false, olderPlatform: true, apps: [{ name: 'main', mount: '', main: true }] })

    // A 404 of a project this credential cannot reach is that refusal, never "an older platform".
    const missing = notFound('viable-project:not-found:p1')
    const foreign = depsOf(CLOUD, { project: { apps: async () => { throw missing }, status: async () => { throw notFound() } } })
    await expect(run('project_apps', {}, foreign)).rejects.toBe(missing)
  })

  test('a local project answers the map, and says the run on this machine is what serves it', async () => {
    const dir = await makeTargetTree({ split: true })
    roots.push(dir)
    const view: ConnectAppsView = { ...SPLIT, local: true, apps: SPLIT.apps.map(({ name, mount, areas, main }) => ({ name, mount, areas, main })) }
    delete (view as { worker?: unknown }).worker
    const result = await run('project_apps', {}, depsOf(LOCAL, { project: { apps: async () => view } }, { dir }))

    expect(result.text).toContain('  admin · /admin · areas admin')
    expect(result.text).not.toContain('server')
    expect(result.text).toContain('run_local serves every application here, each under its path on http://localhost:5173.')
    expect(result.text).toContain('Nothing runs here now — run_local starts every application.')
  })

  test('restart_project_app restarts one app of the preview, the interface only when asked', async () => {
    const deps = depsOf(CLOUD, { sandbox: { restartApp: async () => SPLIT } })

    const result = await run('restart_project_app', { app: 'admin' }, deps)
    await run('restart_project_app', { app: 'admin', web: true, projectId: 'p2' }, deps)

    expect(result.text).toStartWith('Restarted admin; the others kept serving.')
    expect(result.structured).toMatchObject({ restarted: 'admin', cause: 'TypeError: x is undefined' })
    expect(deps.calls).toEqual([
      ['sandbox.restartApp', ['p1', 'admin', {}]],
      ['sandbox.restartApp', ['p2', 'admin', { api: true, web: true }]],
    ])
    expect((await run('restart_project_app', { app: 'Admin-Web' }, deps)).isError).toBe(true)
    expect(deps.calls).toHaveLength(2)
  })

  test('a runtime older than per-app restarts is told to restart the whole preview — restart_preview under a listing', async () => {
    const refusal = new Error('ResilientError|||viable-agent-common:slot-app:restart-unsupported|||stack')
    const api = { sandbox: { restartApp: async () => { throw refusal } } }

    const plain = await boundary(depsOf(CLOUD, api))('restart_project_app', { app: 'admin' })
    expect(plain.isError).toBe(true)
    expect(plain.content[0]!.text).toContain('Restart the whole preview with preview_control { action: restart }')

    const listed = await boundary(depsOf({ ...HOSTED, profile: listingProfile }, api))('restart_project_app', { app: 'admin' })
    expect(listed.content[0]!.text).toContain('Restart the whole preview with restart_preview')

    const unknown = await boundary(depsOf(CLOUD, { sandbox: { restartApp: async () => {
      throw new Error('ResilientError|||viable-agent-common:slot-app:unknown:shop|||stack')
    } } }))('restart_project_app', { app: 'shop' })
    expect(unknown.content[0]!.text).toContain('The preview serves no application (shop). project_apps lists')
  })

  test('a bare 404 on a restart: an older platform restarts the whole preview, a newer one lists the apps it has', async () => {
    const status = async () => ({ project: { id: 'p1' } })
    const older = await run('restart_project_app', { app: 'admin' }, depsOf(CLOUD, {
      project: { status, apps: async () => { throw notFound() } },
      sandbox: { restartApp: async () => { throw notFound() } },
    }))
    expect(older.isError).toBe(true)
    expect(older.text).toBe('This platform reports one application (main) for every project: it predates applications,'
      + ' so there is nothing to list or restart one by one. Restart the whole preview with preview_control { action: restart }.')

    const unknown = await run('restart_project_app', { app: 'shop' }, depsOf(CLOUD, {
      project: { status, apps: async () => SPLIT },
      sandbox: { restartApp: async () => { throw notFound('incident') } },
    }))
    expect(unknown.text).toStartWith('The preview serves no application shop. Nothing was restarted.\n3 applications')
  })

  test('on this machine a restart needs a run that holds the app — the platform is never asked', async () => {
    const dir = await makeTargetTree({ split: true })
    roots.push(dir)
    const deps = depsOf(LOCAL, {}, { dir })

    expect((await run('restart_project_app', { app: 'admin' }, deps)).text)
      .toBe('Nothing runs on this machine — run_local builds and starts every application.')
    await fse.outputJson(path.join(dir, CONNECT_RUN_FILE), {
      dir, startedAt: '2026-11-11T10:00:00.000Z', api: { pid: -1, port: 3000 },
      apps: [{ name: 'main', mount: '', index: 0, api: { pid: -1, port: 3000 } }, { name: 'admin', mount: 'admin', index: 1 }],
    })
    expect((await run('restart_project_app', { app: 'admin' }, deps)).text)
      .toStartWith('The local run holds no running application admin.')
    expect(deps.calls).toEqual([])
  })
})

describe('viable-sdk — a story names its app only when its card names an area', () => {
  const card = (code: string, fields: Record<string, unknown>): Workcard => ({
    id: `id-${code}`, code, status: 'planned', intrinsic: 'planned', title: `${code} narrative`, parent: 'p1',
    kind: 'card', type: 'viable:user-story', fields: { primary: false, area: 'user', ...fields },
  } as unknown as Workcard)
  const PROJECT = {
    id: 'p1', fields: {
      apps: {
        by: 'default', at: '2026-11-11T10:00:00.000Z',
        areas: [
          { key: 'guest', kind: 'guest', segment: '' }, { key: 'user', kind: 'user', segment: 'frontoffice' },
          { key: 'admin', kind: 'admin', segment: 'admin' }, { key: 'operator', kind: 'operator', segment: 'backoffice' },
        ],
        apps: [
          { name: 'main', mount: '', areas: ['guest', 'user'], web: 'web', api: 'api', index: 0 },
          { name: 'admin', mount: 'admin', areas: ['admin'], web: 'admin-web', api: 'admin-api', index: 1 },
          { name: 'backoffice', mount: 'backoffice', areas: ['operator'], web: 'backoffice-web', api: 'backoffice-api', index: 2 },
        ],
      },
    },
  }

  test('list_stories without an area key reads exactly as before, and reads no project card', async () => {
    const items = [card('S-1', {}), card('S-2', { area: 'admin' })]
    const deps = depsOf(CLOUD, { planning: { cards: { list: async () => ({ items, total: 2, page: 0 }), load: async () => PROJECT } } })
    const result = await run('list_stories', {}, deps)

    expect(result.text).toBe(storyHelper.renderStories(items, 0, 2))
    expect(result.text).not.toContain('app')
    expect(deps.calls.map(([name]) => name)).toEqual(['planning.cards.list'])
  })

  test('a card naming an area gets the flag beside the others, the area still last', async () => {
    const items = [card('S-1', {}), card('S-2', { area: 'admin', areaKey: 'admin' }), card('S-3', { areaKey: 'user', areas: ['operator'] })]
    const deps = depsOf(CLOUD, { planning: { cards: { list: async () => ({ items, total: 3, page: 0 }), load: async () => PROJECT } } })
    const result = await run('list_stories', {}, deps)

    expect(result.text).toContain('  S-1 · planned · user\n')
    expect(result.text).toContain('  S-2 · planned · app: admin · admin\n')
    expect(result.text).toContain('  S-3 · planned · apps: main, backoffice · user\n')
    expect(deps.calls.map(([name]) => name)).toEqual(['planning.cards.list', 'planning.cards.load'])
  })

  test('story_status adds its app line only for such a card', async () => {
    const status = {
      projectId: 'p1', story: { id: 'id-S-2', code: 'S-2', title: 'S-2 narrative', status: 'planned', intrinsic: 'planned' },
      run: null, waitingFor: null,
    }
    const named = card('S-2', { area: 'admin', areaKey: 'admin' })
    const plain = card('S-1', {})
    const api = (found: Workcard) => ({
      planning: { cards: { load: async (id: string) => id === 'p1' ? PROJECT : found, list: async () => ({ items: [], total: 0 }) } },
      story: { status: async () => status },
    })

    const withApp = await run('story_status', { storyId: 'id-S-2' }, depsOf(CLOUD, api(named)))
    expect(withApp.text.split('\n').slice(0, 3)).toEqual(['S-2 · S-2 narrative', 'story: planned (planned)', 'app: admin'])
    expect(withApp.structured).toMatchObject({ apps: ['admin'] })

    const without = await run('story_status', { storyId: 'id-S-1' }, depsOf(CLOUD, api(plain)))
    expect(without.text).not.toContain('app')
    expect(Object.keys(without.structured!)).toEqual(['story'])
  })
})

describe('viable-sdk — project_status and session_status are untouched by applications', () => {
  test('project_status answers the platform\'s status whole, in the lines it always had', async () => {
    const status = {
      project: { id: 'p1', name: 'Shop', alias: 'shop', status: 'ready', intrinsic: 'in-progress' },
      slot: { id: 's1', kind: 'ephemeral', status: 'Ready', slug: 'shop', host: 'shop.example', initialized: true },
      agent: { locked: false },
    } as unknown as ConnectProjectStatus
    const result = await run('project_status', {}, depsOf(CLOUD, { project: { status: async () => status } }))

    expect(result.text).toBe('Shop (shop) · p1\nproject: ready (in-progress)\nslot: ephemeral · Ready · initialized · shop.example\nagent: idle')
    expect(Object.keys(result.structured!).sort()).toEqual(['agent', 'project', 'slot'])
  })

  test('session_status keeps its lines and answers no structured part without a profile', async () => {
    const result = await run('session_status', {}, depsOf(CLOUD, {}))

    expect(result.text).toBe('target: cloud · llm: cloud · harness: claude-code\nproject: p1\nsession: not opened yet — it opens with the first operation')
    expect(result.structured).toBeUndefined()
  })
})
