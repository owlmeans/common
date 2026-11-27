import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApiStatusError } from '@owlmeans/api'
import {
  CONNECT_TOKEN_PREFIX, connect, ConnectConfirmationRequired, ConnectHarness, ConnectLlm, ConnectOutOfCredits,
  ConnectTarget, ConnectWaitReason, ConversionStatus, type ConnectProjectStatus, type ConnectProjectStructure,
} from '@owlmeans/viable-common'

import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { TOOL_DEADLINE_MS } from '../src/consts.js'
import { makeSdkContext } from '../src/context/index.js'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import { serverInstructions } from '../src/tools/mcp.js'
import { statusTextHelper } from '../src/tools/status.js'
import type { ConnectorApi } from '../src/types.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'
import { captureTransport, type CapturedCall } from './context.js'

/**
 * The structure step through the connector: create_project, create_project_with_files and convert_project
 * carry the person's blueprint and case (and the review) on the NEW routes only — a platform without them
 * refuses and nothing is created, a call without them is the released one —, and project_structure /
 * update_project_structure read and submit the step, an advice round asked for the person's agreement.
 * The tools speak the person's words: the `blueprint` argument travels as the wire's `case`, the `case`
 * argument as its `category`, and the one stack (the wire's `blueprint`) is neither taken nor shown.
 */
const STATUS = {
  project: { id: 'p1', name: 'League', alias: 'league', status: 'draft', intrinsic: 'draft' },
  agent: { locked: false },
  local: false,
  updatedAt: '2026-11-24T10:00:00.000Z',
} as unknown as ConnectProjectStatus

const CONVERSION = { projectId: 'p2', stage: 'intake', status: ConversionStatus.Running } as never

const VIEW: ConnectProjectStructure = {
  projectId: 'p1', origin: 'creation', status: 'awaiting', revision: 4,
  choice: { stack: 'owlmeans-fullstack-ts', blueprint: 'game', case: 'online-turn' },
  suggestion: { choice: { blueprint: 'web' }, rationale: 'The description reads as a portal.' },
  structure: {
    areas: [{ key: 'guest', kind: 'guest' as never, segment: '' }, { key: 'user', kind: 'user' as never, segment: 'app' }],
    parts: [
      { name: 'common', kind: 'common' as never, dependsOn: [], purpose: 'Shared contracts.' },
      { name: 'main', kind: 'pair' as never, mount: '', index: 0, areas: ['guest', 'user'], dependsOn: ['common'], purpose: 'The game.' },
    ],
  },
  proposal: {
    structure: { areas: [], parts: [] }, rationale: 'A league needs a worker.', changes: [{ op: 'add', part: 'league', to: 'worker' }],
  },
  issues: [],
  kinds: ['pair' as never],
  ideas: ['Weekly leagues'],
}

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio, target: ConnectTarget.Cloud, llm: ConnectLlm.Cloud, harness: ConnectHarness.ClaudeCode,
  hasExecutor: false, ...patch,
})

const tool = (name: string) => catalogue.find(entry => entry.name === name)!

/** The remote API over a captured platform: `missing` lists the aliases it answers as an unknown route. */
const platform = async (opts: { missing?: string[], answer?: (call: CapturedCall) => unknown } = {}) => {
  const context = await makeSdkContext({ apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token` })
  const calls = captureTransport(context, call => {
    // Fastify's own 404 for a route it does not have: a bare status, no incident id.
    if (opts.missing?.includes(call.alias) === true) throw new ApiStatusError(404)
    if (opts.answer != null) return opts.answer(call)
    if (call.alias.includes(':structure:')) return VIEW
    return call.alias.includes(':convert:') ? CONVERSION : STATUS
  })

  return { api: makeRemoteConnectorApi(context), calls }
}

const depsOf = (api: ConnectorApi, h: ToolHost = host(), attachedTo: string | null = null) => {
  let attached: string | null = attachedTo
  const notified: string[] = []
  const deps = {
    api, host: h, dir: process.cwd(),
    session: async () => ({ session: { id: 's1' } }) as never,
    currentSession: () => null,
    attached: () => attached,
    attach: (projectId: string) => { attached = projectId },
    detach: () => { attached = null },
    log: () => undefined,
    notify: (_level: string, text: string) => { notified.push(text) },
  } as unknown as ToolDeps

  return { deps, notified }
}

describe('viable-sdk — the structure step\'s members', () => {
  test('each addresses its own route, only the named fields crossing, under the tool deadline', async () => {
    const { api, calls } = await platform()

    await api.project.createWithChoice!({
      prompt: 'A league', target: ConnectTarget.Cloud, blueprint: 'game', tenancy: { users: true, operators: false },
      reviewStructure: true, extra: 'never sent',
    } as never)
    await api.project.structure!('p1')
    await api.project.submitStructure!('p1', { revision: 4, choice: { blueprint: 'web' }, advise: true, confirm: true })
    await api.convert.createWithChoice!({ origin: { kind: 'github' as never, repoUrl: 'https://github.com/a/b' }, blueprint: 'web' })

    expect(calls.map(call => [call.alias, call.path, call.body, call.timeout])).toEqual([
      [connect.project.createWithChoice, '/connect/project/with-choice',
        { prompt: 'A league', target: ConnectTarget.Cloud, blueprint: 'game', tenancy: { users: true, operators: false }, reviewStructure: true },
        TOOL_DEADLINE_MS],
      [connect.project.structure.get, '/connect/project/:id/structure', undefined, TOOL_DEADLINE_MS],
      [connect.project.structure.submit, '/connect/project/:id/structure',
        { revision: 4, choice: { blueprint: 'web' }, advise: true, confirm: true }, TOOL_DEADLINE_MS],
      [connect.convert.createWithChoice, '/connect/convert/with-choice',
        { origin: { kind: 'github', repoUrl: 'https://github.com/a/b' }, blueprint: 'web' }, TOOL_DEADLINE_MS],
    ])
  })
})

describe('viable-sdk — a create or a conversion with the person\'s choice', () => {
  test('create_project without a choice is the released call — the references route, the same body', async () => {
    const { api, calls } = await platform()

    await tool('create_project').run({ prompt: 'A league' }, depsOf(api).deps)
    await tool('create_project').run({ prompt: 'A league', review_structure: false }, depsOf(api).deps)

    expect(calls.map(call => [call.alias, call.body])).toEqual([
      [connect.project.createWithReferences, { prompt: 'A league', target: ConnectTarget.Cloud }],
      [connect.project.createWithReferences, { prompt: 'A league', target: ConnectTarget.Cloud }],
    ])
  })

  test('create_project with a choice asks the create with the choice and attaches the new project', async () => {
    const { api, calls } = await platform()
    const { deps } = depsOf(api)

    const created = await tool('create_project').run({
      prompt: 'A league', blueprint: 'game', case: 'online-turn', review_structure: true,
    }, deps)

    expect(created.isError).toBeUndefined()
    // The blueprint is the wire's case and the case its category; no stack is sent.
    expect(calls.map(call => [call.alias, call.body])).toEqual([[connect.project.createWithChoice, {
      prompt: 'A league', target: ConnectTarget.Cloud, blueprint: 'game', case: 'online-turn', reviewStructure: true,
    }]])
    expect(deps.attached()).toBe('p1')
  })

  test('an older platform (a bare 404) or a connector without the member refuses — nothing is created, no fallback', async () => {
    const { api, calls } = await platform({ missing: [connect.project.createWithChoice] })

    const refused = await tool('create_project').run({ prompt: 'A league', blueprint: 'game' }, depsOf(api).deps)
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('nothing was created')
    expect(calls.map(call => call.alias)).toEqual([connect.project.createWithChoice])

    const bare = { project: { create: async () => { throw new Error('the released create must not be asked') } } } as unknown as ConnectorApi
    const memberless = await tool('create_project').run({ prompt: 'A league', review_structure: true }, depsOf(bare).deps)
    expect([memberless.isError, memberless.text.includes('Call create_project again without them')]).toEqual([true, true])
  })

  test('a refusal the platform decided is thrown as it came', async () => {
    const { api } = await platform({
      answer: () => { throw new ConnectOutOfCredits(ConnectOutOfCredits.encode('create', 1, 0, 'https://vib.test/?top-up=create')) },
    })

    const refused = await tool('create_project').run({ prompt: 'A league', blueprint: 'game' }, depsOf(api).deps).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(ConnectOutOfCredits)
  })

  test('create_project_with_files announces its files on the create with the choice, then sends them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'viable-sdk-structure-'))
    writeFileSync(join(dir, 'brief.md'), '# A league')
    const asked: Array<[string, unknown]> = []
    const api = {
      project: { createWithChoice: async (body: unknown) => { asked.push(['createWithChoice', body]); return STATUS } },
      materials: {
        create: async () => { throw new Error('the create without the choice must not be asked') },
        upload: async (projectId: string, inputs: unknown[]) => {
          asked.push(['upload', projectId])
          return inputs.map((_input, index) => ({ index, ok: true, result: { status: 'accepted' } }))
        },
        seal: async (projectId: string) => { asked.push(['seal', projectId]); return {} },
      },
    } as unknown as ConnectorApi
    const { deps } = depsOf(api)

    await tool('create_project_with_files').run({ prompt: 'A league', paths: [join(dir, 'brief.md')], blueprint: 'game' }, { ...deps, dir })

    expect(asked[0]).toEqual(['createWithChoice', {
      prompt: 'A league', materials: { files: 1, bytes: 10 }, target: ConnectTarget.Cloud, blueprint: 'game',
    }])
    expect(asked.slice(1).map(([what]) => what)).toEqual(['upload', 'seal'])

    const missing = await platform({ missing: [connect.project.createWithChoice] })
    const refused = await tool('create_project_with_files')
      .run({ prompt: 'A league', paths: [join(dir, 'brief.md')], review_structure: true }, { ...depsOf(missing.api).deps, dir })
    expect([refused.isError, refused.text.includes('nothing was created or sent')]).toEqual([true, true])
    expect(missing.calls.map(call => call.alias)).toEqual([connect.project.createWithChoice])
  })

  test('convert_project files a conversion with the choice; an older platform or a filed project refuses', async () => {
    const { api, calls } = await platform()
    await tool('convert_project').run({ repoUrl: 'https://github.com/a/b', blueprint: 'work-management', case: 'crm' }, depsOf(api).deps)
    expect(calls[0]).toMatchObject({
      alias: connect.convert.createWithChoice,
      body: { target: ConnectTarget.Cloud, origin: { kind: 'github', repoUrl: 'https://github.com/a/b' }, blueprint: 'work-management', case: 'crm' },
    })

    const released = await platform()
    await tool('convert_project').run({ repoUrl: 'https://github.com/a/b' }, depsOf(released.api).deps)
    expect(released.calls[0]!.alias).toBe(connect.convert.create)

    const missing = await platform({ missing: [connect.convert.createWithChoice] })
    const refused = await tool('convert_project').run({ repoUrl: 'https://github.com/a/b', blueprint: 'web' }, depsOf(missing.api).deps)
    expect([refused.isError, refused.text.includes('nothing was filed')]).toEqual([true, true])
    expect(missing.calls.map(call => call.alias)).toEqual([connect.convert.createWithChoice])

    const filed = await platform()
    const named = await tool('convert_project').run({ projectId: 'p9', blueprint: 'web' }, depsOf(filed.api).deps)
    expect([named.isError, named.text.includes('filed already')]).toEqual([true, true])
    expect(filed.calls).toEqual([])
  })
})

describe('viable-sdk — project_structure and update_project_structure', () => {
  test('project_structure renders the step, the parts, the advice and the structure to edit, ending in next', async () => {
    const { api } = await platform()
    const answer = await tool('project_structure').run({ projectId: 'p1' }, depsOf(api).deps)

    expect(answer.text).toContain('Project structure of p1 · creation · awaiting · revision 4')
    // The person's words: the wire's case is the blueprint, its category the case; the one stack unsaid.
    expect(answer.text).toContain('\nblueprint: game · case: online-turn\n')
    expect(answer.text).toContain('suggested instead: blueprint: web — ')
    expect(answer.text.split('\n').slice(0, 3).join('\n')).not.toContain('owlmeans-fullstack-ts')
    expect(answer.text).toContain('main (pair) · at / · areas guest, user · depends on common — The game.')
    expect(answer.text).toContain('changes: add league → worker')
    expect(answer.text).toContain(JSON.stringify(VIEW.structure))
    expect(answer.text).toContain('next: update_project_structure { "projectId": "p1", "revision": 4 }')
    expect(answer.structured).toEqual(VIEW)
  })

  test('an older platform or a connector without the members says the platform has no structure step', async () => {
    const { api } = await platform({ missing: [connect.project.structure.get, connect.project.structure.submit] })
    const read = await tool('project_structure').run({ projectId: 'p1' }, depsOf(api).deps)
    const submitted = await tool('update_project_structure').run({ projectId: 'p1', revision: 1 }, depsOf(api).deps)
    const bare = await tool('project_structure').run({ projectId: 'p1' }, depsOf({ project: {} } as unknown as ConnectorApi).deps)

    for (const answer of [read, submitted, bare]) {
      expect([answer.isError, answer.text.includes('no structure step for connectors')]).toEqual([true, true])
    }
  })

  test('update_project_structure sends only what it was given; without advice it continues', async () => {
    const { api, calls } = await platform({ answer: () => ({ ...VIEW, status: 'specifying', revision: 5 }) })
    const answer = await tool('update_project_structure').run({ projectId: 'p1', revision: 4, structure: VIEW.structure }, depsOf(api).deps)

    expect(calls[0]!.body).toEqual({ revision: 4, structure: VIEW.structure })
    expect(answer.text).toContain('The structure is taken.')

    // A changed choice in the person's words reaches the platform in its own: the blueprint as the case, the case as the category.
    await tool('update_project_structure').run({ projectId: 'p1', revision: 4, blueprint: 'work-management', case: 'crm' }, depsOf(api).deps)
    expect(calls[1]!.body).toEqual({ revision: 4, choice: { blueprint: 'work-management', case: 'crm' } })
    expect(answer.text).toContain('next: project_status { "projectId": "p1" } until the specification is in, then confirm_project')
  })

  test('an advice round that would spend credits answers with its cost and the exact call to repeat', async () => {
    const confirmation = new ConnectConfirmationRequired(ConnectConfirmationRequired.encode({
      action: 'structure-advise', cap: 0, spent: 0, estimate: 0, fromAllowance: 0, fromCreditLimits: 0, moneyUsd: 0,
    }))
    const { api, calls } = await platform({ answer: () => { throw confirmation } })
    const { deps, notified } = depsOf(api)

    const answer = await tool('update_project_structure').run({ projectId: 'p1', revision: 4, ideas: 'Weekly leagues', confirm: false }, deps)

    expect(answer.isError).toBe(true)
    expect(answer.text).toContain('Nothing was started. An advice round is model work')
    expect(answer.text).toContain('update_project_structure {"projectId":"p1","revision":4,"ideas":"Weekly leagues","confirm":true}')
    expect(notified).toEqual([answer.text])
    expect(calls[0]!.body).toEqual({ revision: 4, ideas: 'Weekly leagues' })

    // A production body keeps only the status: answered as the confirmation for an unconfirmed advice round.
    const bare = await platform({ answer: () => { throw new ApiStatusError(428, '0b9a3f52-6a3c-4cbe-9d38-5cc2b6a8f0aa') } })
    const status = await tool('update_project_structure').run({ projectId: 'p1', revision: 4, advise: true }, depsOf(bare.api).deps)
    expect(status.text).toContain('the platform waits for the user\'s go-ahead')
  })

  test('the structure step\'s refusals are phrased by marker', async () => {
    const { api } = await platform({ answer: () => { throw new Error('preliminary:stale:7') } })
    const refused = await tool('update_project_structure').run({ projectId: 'p1', revision: 4 }, depsOf(api).deps).catch((e: unknown) => e)
    const { refusalHelper } = await import('../src/tools/refusal.js')

    expect(refusalHelper.refusalPhrase(refused)).toContain('it is at revision 7 now')
    expect(refusalHelper.refusalPhrase(new Error('preliminary:structure-invalid:part-unknown@league')))
      .toContain('breaks the platform\'s rules (part-unknown@league)')
    // The platform's codes and the phrase both name the blueprint and the case.
    expect(refusalHelper.refusalPhrase(new Error('preliminary:case-choice:blueprint-unknown,case-required')))
      .toContain('cannot stand as chosen (no such blueprint; a work-management blueprint needs its case, the kind of work)')
  })
})

describe('viable-sdk — where the structure step is said', () => {
  test('a draft waiting for the person with no question waits at its structure step', () => {
    const waiting = { ...STATUS, waitingFor: ConnectWaitReason.Person } as ConnectProjectStatus

    expect(statusTextHelper.atStructureStep(waiting)).toBe(true)
    expect(statusTextHelper.renderProjectStatus(waiting))
      .toContain('next: project_structure { "projectId": "p1" } — the project waits at its structure step')
    // A question asked, or a project past its draft, is what it always was.
    expect(statusTextHelper.atStructureStep({ ...waiting, pendingInquiry: { id: 'q1' } } as never)).toBe(false)
    expect(statusTextHelper.renderProjectStatus({ ...waiting, project: { ...STATUS.project, status: 'confirmed' } }))
      .toContain('next: next_question')
  })

  test('both tools on every host, in the projects group, named by the workflow and the descriptions', () => {
    for (const h of [host(), host({ kind: ToolHostKind.Http }), host({ target: ConnectTarget.Local, hasExecutor: true })]) {
      const offered = catalogueHelper.visibleTools(h).map(entry => entry.name)
      expect(offered).toEqual(expect.arrayContaining(['project_structure', 'update_project_structure']))
      expect(serverInstructions({ host: h })).toContain('project_structure → update_project_structure')
    }
    const projects = PLATFORM_CATALOGUE.capabilities.find(group => group.id === 'projects')!
    expect(projects.tools).toEqual(expect.arrayContaining(['project_structure', 'update_project_structure']))
    expect(tool('update_project_structure').description).toContain('confirm: true')
    expect(tool('update_project_structure').description).toContain('credits')
    for (const name of ['create_project', 'create_project_with_files', 'convert_project', 'update_project_structure']) {
      expect([name, Object.keys(tool(name).input)]).toEqual([name, expect.arrayContaining(['blueprint', 'case', 'bot_platforms', 'tenancy'])])
      // No stack and no category argument: the blueprint is the kind of product, the case its category.
      expect([name, Object.keys(tool(name).input)]).toEqual([name, expect.not.arrayContaining(['category', 'stack'])])
    }
    expect(Object.keys(tool('convert_project').input)).not.toContain('review_structure')
    // describe_blueprints keeps its output and says how its registry maps onto the arguments.
    expect(tool('describe_blueprints').description).toContain('Each entry it lists is a stack')
    expect(tool('describe_blueprints').description).toContain('takes as blueprint, and the categories under each case what they take as case')
    expect(serverInstructions({ host: host() })).toContain('blueprint (one of the cases describe_blueprints lists under its stack entry)')
  })
})
