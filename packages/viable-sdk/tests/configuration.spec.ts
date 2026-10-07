import { describe, expect, test } from 'bun:test'
import { AuthenPayloadError } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'
import {
  CONNECT_TOKEN_PREFIX, connect, ConnectHarness, ConnectLlm, ConnectTarget, WorkloadKind,
  type ConnectConfigSaveBody, type ConnectProjectBranding, type ConnectProjectConfig,
} from '@owlmeans/viable-common'
import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { TOOL_DEADLINE_MS } from '../src/consts.js'
import { makeSdkContext } from '../src/context/index.js'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'
import { captureTransport } from './context.js'

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio,
  target: ConnectTarget.Cloud,
  llm: ConnectLlm.Cloud,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: true,
  ...patch,
})

const toolNamed = (name: string) => {
  const tool = catalogue.find(entry => entry.name === name)
  if (tool == null) throw new Error(`no tool ${name}`)

  return tool
}

const CONFIG: ConnectProjectConfig = {
  scope: WorkloadKind.Ephemeral,
  backend: [{ name: 'STRIPE_SECRET_KEY', set: true }, { name: 'SMTP_PASSWORD', set: false }],
  frontend: [{ name: 'PUBLIC_MAP_KEY', set: true, value: 'pk_map_123' }, { name: 'PUBLIC_SITE', set: false, value: '' }],
}

const SETTINGS: ConnectProjectBranding = {
  copyright: '© 2026 Acme Ltd', organizationName: 'Acme Ltd', termsUrl: '/terms', privacyUrl: '/privacy',
  googleTag: '', credit: { hidden: false, requested: false, entitled: true },
}

/** A connector whose calls are recorded in ORDER with the session it opens. */
const connector = (api: Record<string, unknown>, patch: Partial<ToolHost> = {}) => {
  const order: string[] = []
  const notified: string[] = []
  const deps = {
    host: host(patch),
    api,
    session: async () => { order.push('session'); return {} as never },
    currentSession: () => null,
    attached: () => 'p1',
    attach: () => undefined,
    log: () => undefined,
    notify: (_level: string, text: string) => { notified.push(text) },
  } as unknown as ToolDeps

  return { deps, order, notified }
}

describe('viable-sdk — the configuration tools', () => {
  test('are offered on both hosts, in their own capability group', () => {
    const tools = ['project_configuration', 'update_project_configuration', 'recollect_configuration']
    for (const kind of [ToolHostKind.Stdio, ToolHostKind.Http]) {
      const offered = catalogueHelper.visibleTools(host({ kind, hasExecutor: kind === ToolHostKind.Stdio }))
        .map(tool => tool.name)
      for (const tool of [...tools, 'set_platform_credit', 'organization_branding', 'update_organization_branding', 'backfill_project_branding']) {
        expect([kind, tool, offered.includes(tool)]).toEqual([kind, tool, true])
      }
    }
    expect(PLATFORM_CATALOGUE.capabilities.find(group => group.id === 'configuration')?.tools).toEqual(tools)
    expect(PLATFORM_CATALOGUE.capabilities.find(group => group.id === 'settings')?.tools).toContain('set_platform_credit')
    expect(PLATFORM_CATALOGUE.capabilities.find(group => group.id === 'organization')?.tools)
      .toEqual(['organization_branding', 'update_organization_branding', 'backfill_project_branding'])
    expect(toolNamed('project_configuration').annotations?.readOnlyHint).toBe(true)
    expect(toolNamed('update_project_configuration').annotations?.destructiveHint).toBe(false)
  })

  test('project_configuration says whether a backend variable is set — never its value — and shows the public ones', async () => {
    // A backend entry that carried a value anyway (an older or broken platform) is still not printed.
    const leaky = { ...CONFIG, backend: [{ name: 'STRIPE_SECRET_KEY', set: true, value: 'sk_live_SECRET' }, ...CONFIG.backend.slice(1)] }
    const scopes: unknown[] = []
    const { deps } = connector({ config: { get: async (_id: string, scope?: string) => { scopes.push(scope); return leaky } } })

    const result = await toolNamed('project_configuration').run({ scope: 'production' }, deps)

    expect(scopes).toEqual([WorkloadKind.Production])
    expect(result.text).not.toContain('sk_live_SECRET')
    expect(result.text).toContain('STRIPE_SECRET_KEY: set')
    expect(result.text).toContain('SMTP_PASSWORD: NOT SET')
    expect(result.text).toContain('PUBLIC_MAP_KEY: pk_map_123')
    expect(result.text).toContain('still without a value: SMTP_PASSWORD, PUBLIC_SITE')
    expect(result.text.split('\n').at(-1)).toContain('update_project_configuration')
  })

  test('update_project_configuration sends the named maps as lists, after attaching its connector', async () => {
    const sent: Array<[string, ConnectConfigSaveBody, string | undefined]> = []
    const { deps, order } = connector({
      config: {
        save: async (id: string, body: ConnectConfigSaveBody, scope?: string) => {
          order.push('save'); sent.push([id, body, scope]); return CONFIG
        },
      },
    })

    const result = await toolNamed('update_project_configuration').run({
      backend: { SMTP_PASSWORD: 'hunter2' }, frontend: { PUBLIC_SITE: 'https://acme.example' }, unrelated: 'x',
    }, deps)

    expect(order).toEqual(['session', 'save'])
    expect(sent).toEqual([['p1', {
      backend: [{ name: 'SMTP_PASSWORD', value: 'hunter2' }],
      frontend: [{ name: 'PUBLIC_SITE', value: 'https://acme.example' }],
    }, undefined]])
    expect(result.isError).not.toBe(true)
    expect(result.text).toContain('Set SMTP_PASSWORD, PUBLIC_SITE.')
    // The value it was given is never echoed back.
    expect(result.text).not.toContain('hunter2')
  })

  test('with nothing to set it says so, and neither attaches nor saves', async () => {
    const { deps, order } = connector({ config: { save: async () => { order.push('save'); return CONFIG } } })

    const result = await toolNamed('update_project_configuration').run({ backend: {} }, deps)

    expect(result.isError).toBe(true)
    expect(result.text).toContain('project_configuration lists')
    expect(order).toEqual([])
  })

  test('a variable the platform refuses comes back as a sentence naming it', async () => {
    const refused = ResilientError.ensure(ResilientError.marshal(new AuthenPayloadError('STRIPE_SECRET_KEY')))
    const { deps } = connector({ config: { save: async () => { throw refused } } })

    const result = await toolNamed('update_project_configuration').run({ frontend: { STRIPE_SECRET_KEY: 'x' } }, deps)

    expect(result.isError).toBe(true)
    expect(result.text).toContain('STRIPE_SECRET_KEY')
    expect(result.text).not.toContain('authen:payload:')
  })

  test('recollect_configuration attaches, asks the platform and answers the configuration', async () => {
    const { deps, order } = connector({ config: { recollect: async () => { order.push('recollect'); return CONFIG } } })

    const result = await toolNamed('recollect_configuration').run({}, deps)

    expect(order).toEqual(['session', 'recollect'])
    expect(result.text).toContain('The sources were read again.')
    expect(result.text).toContain('STRIPE_SECRET_KEY: set')
  })
})

describe('viable-sdk — the platform credit and the organization defaults', () => {
  test('project_settings says where the credit stands and how to change it', async () => {
    const { deps } = connector({ projectBranding: async () => SETTINGS })

    const result = await toolNamed('project_settings').run({}, deps)

    expect(result.text).toContain('platform credit: shown · the plan allows hiding it (set_platform_credit)')
    expect(result.text.split('\n').at(-1)).toContain('set_platform_credit hides or shows the credit')

    const lapsed = connector({ projectBranding: async () => ({ ...SETTINGS, credit: { hidden: false, requested: true, entitled: false } }) })
    expect((await toolNamed('project_settings').run({}, lapsed.deps)).text)
      .toContain('hidden again on its own once the plan includes white label')
  })

  test('set_platform_credit sends the switch; a plan without white label is a person refusal, notified', async () => {
    const sent: unknown[] = []
    const { deps, order } = connector({
      setPlatformCredit: async (id: string, hidden: boolean, scope?: string) => {
        order.push('credit'); sent.push([id, hidden, scope])
        return { ...SETTINGS, credit: { hidden, requested: hidden, entitled: true } }
      },
    })

    const result = await toolNamed('set_platform_credit').run({ hidden: true }, deps)

    expect(order).toEqual(['session', 'credit'])
    expect(sent).toEqual([['p1', true, undefined]])
    expect(result.text).toContain('platform credit: hidden (white label)')

    const refusal = new Error('auth:forbidden:entitlement:capability-required:feature:branding--whitelabel')
    const refused = connector({ setPlatformCredit: async () => { throw refusal } })
    const answer = await toolNamed('set_platform_credit').run({ hidden: true }, refused.deps)
    expect(answer.isError).toBe(true)
    expect(answer.text).toContain('hiding the OwlMeans credit')
    expect(answer.text).not.toContain('capability-required')
    expect(refused.notified).toEqual([answer.text])
  })

  test('update_project_settings copies the organization defaults on their own, never beside other fields', async () => {
    const calls: string[] = []
    const { deps, order } = connector({
      copyOrganizationBranding: async (id: string) => { order.push(`copy:${id}`); return SETTINGS },
      saveProjectBranding: async () => { calls.push('save'); return SETTINGS },
    })

    const copied = await toolNamed('update_project_settings').run({ useOrganizationDefaults: true }, deps)
    expect(order).toEqual(['session', 'copy:p1'])
    expect(copied.text).toContain('Copied the organization\'s name and copyright into the project.')

    const mixed = await toolNamed('update_project_settings').run({ useOrganizationDefaults: true, copyright: '© X' }, deps)
    expect(mixed.isError).toBe(true)
    expect(mixed.text).toContain('without copyright')
    expect(calls).toEqual([])
  })

  test('a production scope is named in the settings and in where the change goes', async () => {
    const scopes: unknown[] = []
    const { deps } = connector({
      saveProjectBranding: async (_id: string, _patch: unknown, scope?: string) => { scopes.push(scope); return SETTINGS },
    })

    const result = await toolNamed('update_project_settings').run({ googleTag: 'G-ABC1234', scope: 'production' }, deps)

    expect(scopes).toEqual([WorkloadKind.Production])
    expect(result.text).toContain('production\'s own set')
    expect(result.text).toContain('settings of p1 · production')
  })

  test('the organization tools read, patch and backfill the defaults', async () => {
    const saved: unknown[] = []
    const { deps } = connector({
      account: {
        branding: {
          get: async () => ({ organizationName: 'Acme', copyright: '© Acme' }),
          save: async (patch: object) => { saved.push(patch); return { organizationName: 'Acme Ltd', copyright: '© Acme' } },
          backfill: async () => ({ projects: 2 }),
        },
      },
    })

    expect((await toolNamed('organization_branding').run({}, deps)).text).toContain('organization: Acme')
    const result = await toolNamed('update_organization_branding').run({ organizationName: ' Acme Ltd ', termsUrl: '/x' }, deps)
    expect(saved).toEqual([{ organizationName: 'Acme Ltd' }])
    expect(result.text).toContain('Saved organizationName.')
    expect((await toolNamed('update_organization_branding').run({}, deps)).isError).toBe(true)
    expect((await toolNamed('backfill_project_branding').run({}, deps)).text).toContain('2 project(s)')
  })
})

describe('viable-sdk — the remote configuration, credit and organization routes', () => {
  test('each call addresses its own route with the scope only when named, under the tool deadline', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const calls = captureTransport(context, call => call.alias.includes(':account:branding:backfill')
      ? { projects: 0 } : call.alias.includes(':config:') ? CONFIG : SETTINGS)
    const api = makeRemoteConnectorApi(context)

    await api.config.get('p1')
    await api.config.save('p1', { backend: [{ name: 'K', value: 'v' }] }, WorkloadKind.Production)
    await api.config.recollect('p1')
    await api.setPlatformCredit('p1', true)
    await api.copyOrganizationBranding('p1', WorkloadKind.Production)
    await api.projectBranding('p1', WorkloadKind.Production)
    await api.account.branding.get()
    await api.account.branding.save({ copyright: '© Acme' })
    await api.account.branding.backfill()

    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.config.get, '/connect/project/:id/config', TOOL_DEADLINE_MS],
      [connect.config.save, '/connect/project/:id/config', TOOL_DEADLINE_MS],
      [connect.config.recollect, '/connect/project/:id/config/recollect', TOOL_DEADLINE_MS],
      [connect.project.branding.credit, '/connect/project/:id/branding/credit', TOOL_DEADLINE_MS],
      [connect.project.branding.copyDefaults, '/connect/project/:id/branding/copy-defaults', TOOL_DEADLINE_MS],
      [connect.project.branding.get, '/connect/project/:id/branding', TOOL_DEADLINE_MS],
      [connect.account.branding.get, '/connect/account/branding', TOOL_DEADLINE_MS],
      [connect.account.branding.save, '/connect/account/branding', TOOL_DEADLINE_MS],
      [connect.account.branding.backfill, '/connect/account/branding/backfill', TOOL_DEADLINE_MS],
    ])
    expect(calls[0]!.query).not.toHaveProperty('scope')
    expect(calls[1]!.query).toMatchObject({ scope: 'production' })
    expect(calls[1]!.body).toEqual({ backend: [{ name: 'K', value: 'v' }] })
    expect(calls[3]!.body).toEqual({ hideCredit: true })
    expect(calls[7]!.body).toEqual({ copyright: '© Acme' })
  })
})
