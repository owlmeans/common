import { describe, expect, test } from 'bun:test'
import { ApiStatusError } from '@owlmeans/api'
import {
  CONNECT_TOKEN_PREFIX, connect, ConnectHarness, ConnectLlm, ConnectOutOfCredits, ConnectTarget, ViableImplementChoice,
  type ConnectProjectStatus,
} from '@owlmeans/viable-common'
import type { z } from 'zod'

import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { TOOL_DEADLINE_MS } from '../src/consts.js'
import { makeSdkContext } from '../src/context/index.js'
import { catalogue } from '../src/tools/catalogue.js'
import { ToolHostKind } from '../src/tools/consts.js'
import type { ConnectorApi } from '../src/types.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'
import { captureTransport, type CapturedCall } from './context.js'

/**
 * confirm_project's choice at the specification approval: with `implement` the tool asks the platform's
 * `connect.project.confirmImplementation` (the edits and the choice in one body); without it, exactly the
 * confirm it always asked; on a platform older than the route — or through a host's implementation
 * without the member — it confirms nothing and says the choice is not offered yet.
 */
const STATUS = {
  project: { id: 'p1', name: 'Crmore', alias: 'crmore', status: 'confirmed', description: 'A CRM.' },
  agent: { locked: false },
} as unknown as ConnectProjectStatus

const host = (): ToolHost => ({
  kind: ToolHostKind.Stdio, target: ConnectTarget.Cloud, llm: ConnectLlm.Cloud, harness: ConnectHarness.ClaudeCode,
  hasExecutor: false,
})

const tool = (name: string) => catalogue.find(entry => entry.name === name)!

/** The remote API over a captured platform: `missing` lists the aliases it answers as an unknown route. */
const platform = async (opts: { missing?: string[], answer?: (call: CapturedCall) => unknown } = {}) => {
  const context = await makeSdkContext({ apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token` })
  const calls = captureTransport(context, call => {
    // Fastify's own 404 for a route it does not have: a bare status, no incident id.
    if (opts.missing?.includes(call.alias) === true) throw new ApiStatusError(404)
    return opts.answer != null ? opts.answer(call) : STATUS
  })

  return { api: makeRemoteConnectorApi(context), calls }
}

const depsOf = (api: ConnectorApi): ToolDeps => ({
  api, host: host(),
  session: async () => ({ session: { id: 's1' } }) as never,
  currentSession: () => null,
  attached: () => 'p1',
  attach: () => undefined,
  detach: () => undefined,
  log: () => undefined,
}) as unknown as ToolDeps

describe('viable-sdk — confirm_project with the implement choice', () => {
  test('the member addresses its own route with the edits and the choice, under the tool deadline', async () => {
    const { api, calls } = await platform()

    await api.project.confirmImplementation('p1', { name: 'Crmore', implement: ViableImplementChoice.Spec })

    expect(calls.map(call => [call.alias, call.path, call.body, call.timeout])).toEqual([
      [connect.project.confirmImplementation, '/connect/project/:id/confirm-implementation',
        { name: 'Crmore', implement: 'spec' }, TOOL_DEADLINE_MS],
    ])
  })

  test('with implement the tool asks the new route; without it, the confirm it always asked', async () => {
    const { api, calls } = await platform()
    const deps = depsOf(api)

    const spec = await tool('confirm_project').run({ projectId: 'p1', description: 'Edited', implement: 'spec' }, deps)
    const preview = await tool('confirm_project').run({ projectId: 'p1', implement: 'preview' }, deps)
    const plain = await tool('confirm_project').run({ projectId: 'p1', name: 'Crmore' }, deps)

    expect([spec.isError, preview.isError, plain.isError]).toEqual([undefined, undefined, undefined])
    expect(calls.map(call => [call.alias, call.body])).toEqual([
      [connect.project.confirmImplementation, { description: 'Edited', implement: 'spec' }],
      [connect.project.confirmImplementation, { implement: 'preview' }],
      [connect.project.confirmWithReferences, { name: 'Crmore' }],
    ])
  })

  test('an older platform answers 404: not offered yet, nothing confirmed, no fallback to a preview', async () => {
    const { api, calls } = await platform({ missing: [connect.project.confirmImplementation] })

    const result = await tool('confirm_project').run({ projectId: 'p1', implement: 'spec' }, depsOf(api))

    expect(result.isError).toBe(true)
    expect(result.text).toContain('does not offer the implement choice yet')
    expect(result.text).toContain('without implement')
    expect(calls.map(call => call.alias)).toEqual([connect.project.confirmImplementation])
  })

  test('a host\'s implementation without the member answers the same, asking nothing', async () => {
    const used: string[] = []
    const legacy = {
      project: {
        confirm: async () => { used.push('confirm'); return STATUS },
        confirmWithReferences: async () => { used.push('confirmWithReferences'); return STATUS },
      },
    } as unknown as ConnectorApi

    const result = await tool('confirm_project').run({ projectId: 'p1', implement: 'preview' }, depsOf(legacy))

    expect([result.isError, used]).toEqual([true, []])
  })

  test('a refusal the platform decided is thrown as it came — the spec gate\'s ConnectOutOfCredits', async () => {
    const refusal = new ConnectOutOfCredits(ConnectOutOfCredits.encode('spec', 0, 100_000, 'https://x.test/top-up'))
    const { api, calls } = await platform({ answer: () => { throw refusal } })

    const thrown = await tool('confirm_project').run({ projectId: 'p1', implement: 'spec' }, depsOf(api)).catch((e: unknown) => e)

    expect(thrown).toBeInstanceOf(ConnectOutOfCredits)
    expect(calls.map(call => call.alias)).toEqual([connect.project.confirmImplementation])
  })

  test('the description and the argument say what each choice does and what a spec costs', () => {
    const confirm = tool('confirm_project')
    const said = (confirm.input.implement as z.ZodType).description ?? ''

    expect(confirm.description).toMatch(/implement: spec/)
    expect(said).toMatch(/preview: draw the application only/)
    expect(said).toMatch(/free spec of the month, otherwise 100,000 credits/)
    expect(said).toMatch(/Free plan needs topped-up credits/)
    expect((confirm.input.implement as z.ZodType).safeParse('later').success).toBe(false)
    expect((confirm.input.implement as z.ZodType).safeParse(undefined).success).toBe(true)
  })
})
