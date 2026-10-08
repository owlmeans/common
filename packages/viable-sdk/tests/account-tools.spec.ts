import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'

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

/** A connector whose platform calls are recorded in order. */
const connector = (account: Record<string, unknown>, project: Record<string, unknown> = {}, attached: string | null = 'p1') => {
  const calls: unknown[][] = []
  const notified: string[] = []
  const deps = {
    host: host(),
    api: { account, project },
    session: async () => ({}) as never,
    currentSession: () => null,
    attached: () => attached,
    attach: () => undefined,
    log: () => undefined,
    notify: (_level: string, text: string) => { notified.push(text) },
  } as unknown as ToolDeps

  return { deps, calls, notified }
}

const ACCOUNT = { llmMode: ConnectLlm.Cloud, canUseLocal: true }
const PROJECT = { llmMode: null, effective: ConnectLlm.Cloud, canUseLocal: true }
const CAPABILITY_REFUSAL = 'auth:forbidden:entitlement:capability-required:feature:connect--local-llm'

describe('viable-sdk — the account tools', () => {
  test('are offered on both hosts, each in its own capability group, reads marked read-only', () => {
    const groups: Record<string, string[]> = {
      inference: ['inference_settings', 'set_inference_mode'],
      'access-tokens': ['list_access_tokens', 'revoke_access_token'],
      privacy: ['privacy_choices', 'withdraw_marketing_consent'],
      intent: ['pickup_intent'],
    }
    for (const kind of [ToolHostKind.Stdio, ToolHostKind.Http]) {
      const offered = catalogueHelper.visibleTools(host({ kind, hasExecutor: kind === ToolHostKind.Stdio })).map(tool => tool.name)
      for (const tool of Object.values(groups).flat()) {
        expect([kind, tool, offered.includes(tool)]).toEqual([kind, tool, true])
      }
    }
    for (const [id, tools] of Object.entries(groups)) {
      expect(PLATFORM_CATALOGUE.capabilities.find(group => group.id === id)?.tools).toEqual(tools)
    }
    for (const name of ['inference_settings', 'list_access_tokens', 'privacy_choices']) {
      expect(toolNamed(name).annotations?.readOnlyHint).toBe(true)
    }
    expect(toolNamed('revoke_access_token').annotations?.destructiveHint).toBe(true)
    // No tool mints a token or gives a consent.
    expect(catalogue.map(tool => tool.name).filter(name => /create_access_token|grant_.*consent|consent_grant|give_.*consent|accept_terms/.test(name))).toEqual([])
  })

  test('inference_settings shows the default, the attached project\'s override, and what it does not reach', async () => {
    const { deps } = connector({ llm: { get: async () => ACCOUNT } }, { llm: async (id: string) => ({ ...PROJECT, id }) })

    const result = await toolNamed('inference_settings').run({}, deps)

    expect(result.text).toContain('your default: cloud')
    expect(result.text).toContain('project p1: inherits your default')
    expect(result.text).toContain('the plan allows the local mode')
    expect(result.text).toContain('--llm')
    expect(result.structured).toMatchObject({ projectId: 'p1', account: ACCOUNT })

    const alone = connector({ llm: { get: async () => ({ ...ACCOUNT, canUseLocal: false }) } }, {}, null)
    const answer = await toolNamed('inference_settings').run({}, alone.deps)
    expect(answer.text).not.toContain('project ')
    expect(answer.text).toContain('needs a plan that includes it')
  })

  test('set_inference_mode sets the default, or a project\'s override — inherit unsets it', async () => {
    const sent: unknown[] = []
    const { deps } = connector({
      llm: {
        get: async () => ACCOUNT,
        set: async (mode: string) => { sent.push(['account', mode]); return { llmMode: mode, canUseLocal: true } },
      },
    }, {
      setLlm: async (id: string, mode: string | null) => { sent.push(['project', id, mode]); return { ...PROJECT, llmMode: mode } },
    })

    expect((await toolNamed('set_inference_mode').run({ level: 'account', mode: 'local' }, deps)).text)
      .toContain('Your default is now local.')
    expect((await toolNamed('set_inference_mode').run({ level: 'project', mode: 'inherit' }, deps)).text)
      .toContain('p1 now follows your default')
    await toolNamed('set_inference_mode').run({ level: 'project', mode: 'local', projectId: 'p2' }, deps)

    expect(sent).toEqual([['account', 'local'], ['project', 'p1', null], ['project', 'p2', 'local']])

    const refused = await toolNamed('set_inference_mode').run({ level: 'account', mode: 'inherit' }, deps)
    expect(refused.isError).toBe(true)
    expect(sent).toHaveLength(3)
  })

  test('a plan without the local mode is a person refusal, notified, and nothing is changed', async () => {
    const { deps, notified } = connector({ llm: { set: async () => { throw new Error(CAPABILITY_REFUSAL) } } })

    const answer = await toolNamed('set_inference_mode').run({ level: 'account', mode: 'local' }, deps)

    expect(answer.isError).toBe(true)
    expect(answer.text).toContain('the delegated model mode')
    expect(answer.text).not.toContain('capability-required')
    expect(notified).toEqual([answer.text])
  })

  test('list_access_tokens lists name, prefix, use and revocation — never a secret', async () => {
    const { deps } = connector({
      tokens: {
        list: async () => ({
          items: [
            { id: 't2', name: 'laptop', display: 'vib_ab12', scopes: ['*'], createdAt: '2026-10-01T00:00:00.000Z', oauth: true },
            {
              id: 't1', name: 'ci', display: 'vib_cd34', scopes: ['*'], createdAt: '2026-09-01T00:00:00.000Z',
              lastUsedAt: '2026-09-02T00:00:00.000Z', revokedAt: '2026-09-03T00:00:00.000Z', oauth: false,
            },
          ],
        }),
      },
    })

    const result = await toolNamed('list_access_tokens').run({}, deps)

    expect(result.text).toContain('2 access token(s), 1 still valid')
    expect(result.text).toContain('laptop (vib_ab12…) · id t2')
    expect(result.text).toContain('from a browser sign-in')
    expect(result.text).toContain('REVOKED 2026-09-03')
    expect(result.text).toContain('only in the web application')
  })

  test('revoke_access_token asks for the user\'s agreement first, then revokes; a foreign id is a sentence', async () => {
    const revoked: string[] = []
    const { deps } = connector({ tokens: { revoke: async (id: string) => { revoked.push(id); return { id } } } })

    const unconfirmed = await toolNamed('revoke_access_token').run({ tokenId: 't1' }, deps)
    expect(unconfirmed.isError).toBe(true)
    expect(revoked).toEqual([])

    const result = await toolNamed('revoke_access_token').run({ tokenId: ' t1 ', confirm: true }, deps)
    expect(revoked).toEqual(['t1'])
    expect(result.text).toContain('Revoked the token t1')

    const foreign = connector({ tokens: { revoke: async () => { throw new Error('auth:authorization:forbidden:token') } } })
    const answer = await toolNamed('revoke_access_token').run({ tokenId: 'theirs', confirm: true }, foreign.deps)
    expect(answer.isError).toBe(true)
    expect(answer.text).toContain('nothing was revoked')
  })

  test('privacy_choices reads saved answers; withdraw_marketing_consent writes only what is named, or every given one', async () => {
    const status = {
      pending: false,
      items: [
        { key: 'marketing.email', group: 'marketing', mode: 'opt-in', granted: true, status: 'current', decidedAt: '2026-09-01T00:00:00.000Z' },
        { key: 'data.partners', group: 'data', mode: 'opt-out', granted: false, status: 'new' },
      ],
    }
    const withdrawn: string[][] = []
    const { deps } = connector({
      privacy: {
        status: async () => status,
        withdraw: async (keys: string[]) => { withdrawn.push(keys); return status },
      },
    })

    const read = await toolNamed('privacy_choices').run({}, deps)
    expect(read.text).toContain('marketing.email (marketing, opt-in): given on 2026-09-01')
    expect(read.text).toContain('data.partners (data, opt-out): never answered (not given)')

    await toolNamed('withdraw_marketing_consent').run({ keys: ['data.partners', ' data.partners '] }, deps)
    await toolNamed('withdraw_marketing_consent').run({ all: true }, deps)
    expect(withdrawn).toEqual([['data.partners'], ['marketing.email']])

    const both = await toolNamed('withdraw_marketing_consent').run({ all: true, keys: ['marketing.email'] }, deps)
    expect(both.isError).toBe(true)
    const none = await toolNamed('withdraw_marketing_consent').run({}, deps)
    expect(none.isError).toBe(true)
    expect(withdrawn).toHaveLength(2)

    const nothingGiven = connector({ privacy: { status: async () => ({ pending: true, items: [status.items[1]] }), withdraw: async () => { throw new Error('called') } } })
    expect((await toolNamed('withdraw_marketing_consent').run({ all: true }, nothingGiven.deps)).text).toContain('nothing to withdraw')
  })

  test('pickup_intent takes the bare code or the whole address, and an expired one is a sentence', async () => {
    const refs: string[] = []
    const ref = '7K3mNpQrStUvWxYz2a4b6c8d'
    const { deps } = connector({ intent: { pickup: async (code: string) => { refs.push(code); return { prompt: 'A booking app for barbers' } } } })

    const result = await toolNamed('pickup_intent').run({ code: ref }, deps)
    await toolNamed('pickup_intent').run({ code: `https://vib.example/start?ref=${ref}&owlcc=x` }, deps)
    await toolNamed('pickup_intent').run({ code: `/start?ref=${ref}` }, deps)

    expect(refs).toEqual([ref, ref, ref])
    expect(result.text).toContain('A booking app for barbers')
    expect(result.text).toContain('create_project')
    expect((await toolNamed('pickup_intent').run({ code: 'https://vib.example/start' }, deps)).isError).toBe(true)

    const expired = connector({ intent: { pickup: async () => { throw new Error('viable-intent:expired:pickup') } } })
    const answer = await toolNamed('pickup_intent').run({ code: ref }, expired.deps)
    expect(answer.isError).toBe(true)
    expect(answer.text).toContain('two minutes')
    expect(answer.text).not.toContain('viable-intent')
  })
})
