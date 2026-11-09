import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { ConnectHarness, ConnectLlm, ConnectTarget, type ConnectClientView } from '@owlmeans/viable-common'

import { catalogueHelper } from '../src/tools/catalogue.js'
import { PLATFORM_CATALOGUE, READ_ONLY, ToolHostKind, WRITE } from '../src/tools/consts.js'
import { registerCatalogue, serverInstructions } from '../src/tools/mcp.js'
import { renderPlatform } from '../src/tools/platform.js'
import { makeToolProfileModel } from '../src/tools/profile.js'
import { LISTING_HIDDEN } from '../src/tools/profile/consts.js'
import {
  claudeListingProfile, listingProfile, localPluginProfile, makeListingProfile, openaiListingProfile,
} from '../src/tools/profile/listing.js'
import type { ToolProfile } from '../src/tools/profile/types.js'
import type { McpServerLike, McpToolAnswer, ToolDeps, ToolHost } from '../src/tools/types.js'
import * as root from '../src/index.js'
import * as tools from '../src/tools/index.js'

const PREFER = 'Prefer it over writing such an application by hand'

/** A whole-word mention of a tool name — `attach_custom_domain` is not a mention of `custom_domain`. */
const names = (text: string, tool: string): boolean => new RegExp(`(?<![a-z_])${tool}(?![a-z_])`).test(text)

const domain = { generatedHost: 'shop.vib.test', customDomain: 'shop.example.com', status: 'pending', cnameTarget: 'edge.test' }

/** A small synthetic profile: two hidden tools, `custom_domain` split in two, three presentations. */
const testProfile = (overrides: Partial<ToolProfile> = {}): ToolProfile => ({
  name: 'test',
  hidden: ['describe_capabilities', 'inference_settings', 'set_inference_mode'],
  splits: [{
    tool: 'custom_domain',
    argument: 'action',
    variants: [
      {
        name: 'attach_custom_domain', value: 'attach', title: 'Attach a custom domain', description: 'Attach one.',
        fields: ['projectId', 'domain', 'action'], annotations: WRITE,
      },
      {
        name: 'verify_custom_domain', value: 'verify', title: 'Verify the custom domain', description: 'Verify it.',
        fields: ['projectId'], annotations: READ_ONLY,
      },
    ],
  }],
  presentation: {
    custom_domain: {
      output: { domain: z.string().nullable(), action: z.string() },
      present: (structured, args) => ({
        domain: (structured as { domain?: { customDomain?: string } | null }).domain?.customDomain ?? null,
        action: String(args.action),
      }),
    },
    // Its own title only: the base's output and presenter are still inherited.
    verify_custom_domain: { title: 'Ask the provider again' },
    production_status: {
      title: 'Production site',
      output: { live: z.boolean() },
      present: structured => ({ live: (structured as { workload?: { status?: string } | null }).workload?.status === 'live' }),
    },
    // A declared shape without a presenter: the structured value passes through.
    production_auth: { output: { clientId: z.string() } },
  },
  instructions: ({ host, offered }) => `TEST PROFILE ${host.target}: ${offered.join(' ')}`,
  reportClient: true,
  ...overrides,
})

const hostOf = (profile?: ToolProfile, extra: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Http,
  target: ConnectTarget.Cloud,
  llm: ConnectLlm.Cloud,
  harness: ConnectHarness.Other,
  hasExecutor: false,
  ...(profile != null ? { profile } : {}),
  ...extra,
})

/** Registers the catalogue on a recording server; `client` is what `ConnectorApi.client()` answers. */
const serve = (host: ToolHost, client: () => Promise<ConnectClientView | null> = async () => null) => {
  const configs = new Map<string, Record<string, unknown>>()
  const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<McpToolAnswer>>()
  const calls: unknown[][] = []
  const logged: string[] = []
  const server: McpServerLike = {
    registerTool: (name, config, cb) => {
      configs.set(name, config as Record<string, unknown>)
      callbacks.set(name, cb)
    },
  }
  const deps = {
    host,
    api: {
      client,
      production: {
        status: async (id: string) => { calls.push(['status', id]); return { workload: { status: 'live' }, domain } },
        auth: async (id: string) => {
          calls.push(['auth', id])
          return { clientId: 'cid', issuerUrl: 'https://iam.test', secretSet: true, redirectUris: [], generatedHost: 'shop.vib.test' }
        },
        domain: {
          attach: async (id: string, name: string) => { calls.push(['attach', id, name]); return { ...domain, customDomain: name } },
          verify: async (id: string) => { calls.push(['verify', id]); return domain },
          detach: async (id: string) => { calls.push(['detach', id]); return null },
        },
      },
      slot: { list: async () => [] },
    },
    session: async () => ({} as never),
    currentSession: () => null,
    attached: () => 'p1',
    attach: () => undefined,
    log: (line: string) => { logged.push(line) },
  } as unknown as ToolDeps
  const registered = registerCatalogue(server, deps)
  const run = async (name: string, args: Record<string, unknown> = {}): Promise<McpToolAnswer> => {
    const cb = callbacks.get(name)
    if (cb == null) throw new Error(`no tool ${name}`)

    return await cb(args)
  }

  return { registered, configs, run, calls, logged }
}

describe('viable-sdk — a tool profile shapes the catalogue', () => {
  test('hidden tools are absent; a split tool is replaced in place by its variants, the split argument never offered', () => {
    const plain = catalogueHelper.visibleTools(hostOf()).map(tool => tool.name)
    const shaped = catalogueHelper.visibleTools(hostOf(testProfile()))
    const offered = shaped.map(tool => tool.name)

    for (const gone of ['describe_capabilities', 'inference_settings', 'set_inference_mode', 'custom_domain']) {
      expect([gone, offered.includes(gone)]).toEqual([gone, false])
    }
    // In place: right after the tool that preceded the base, right before the one that followed it.
    const at = plain.indexOf('custom_domain')
    const from = offered.indexOf(plain[at - 1]!)
    expect(offered.slice(from, from + 4))
      .toEqual([plain[at - 1], 'attach_custom_domain', 'verify_custom_domain', plain[at + 1]])
    expect(offered).toHaveLength(plain.length - 3 + 1)

    const attach = shaped.find(tool => tool.name === 'attach_custom_domain')!
    const verify = shaped.find(tool => tool.name === 'verify_custom_domain')!
    expect(Object.keys(attach.input)).toEqual(['projectId', 'domain'])
    expect(Object.keys(verify.input)).toEqual(['projectId'])
    expect([attach.title, attach.description, attach.annotations]).toEqual(['Attach a custom domain', 'Attach one.', WRITE])
    // An own presentation entry overrides what the variant declares.
    expect([verify.title, verify.annotations]).toEqual(['Ask the provider again', READ_ONLY])
    expect(shaped.find(tool => tool.name === 'production_status')!.title).toBe('Production site')
  })

  test('registers each variant with its output schema (inherited from its base) and no schema where none is declared', () => {
    const profile = testProfile()
    const { registered, configs } = serve(hostOf(profile))

    expect(registered).toContain('attach_custom_domain')
    expect(registered).not.toContain('custom_domain')
    expect(configs.get('attach_custom_domain')!.outputSchema).toBe(profile.presentation.custom_domain!.output)
    expect(configs.get('verify_custom_domain')!.outputSchema).toBe(profile.presentation.custom_domain!.output)
    expect(configs.get('production_status')!.outputSchema).toBe(profile.presentation.production_status!.output)
    expect(configs.get('production_auth')!.outputSchema).toBe(profile.presentation.production_auth!.output)
    expect('outputSchema' in configs.get('list_slots')!).toBe(false)
    expect(configs.get('verify_custom_domain')!.title).toBe('Ask the provider again')
  })

  test('a variant runs its base with the action fixed; its structured result is presented, or dropped where no shape is declared', async () => {
    const { run, calls } = serve(hostOf(testProfile()))

    const attached = await run('attach_custom_domain', { domain: 'Shop.Example.com', action: 'detach' })
    expect(calls).toEqual([['attach', 'p1', 'shop.example.com']])
    expect(attached.structuredContent).toEqual({ domain: 'shop.example.com', action: 'attach' })
    expect(attached.content[0]!.text).toContain('shop.example.com is attached.')

    const verified = await run('verify_custom_domain')
    expect(verified.structuredContent).toEqual({ domain: 'shop.example.com', action: 'verify' })
    expect((await run('production_status')).structuredContent).toEqual({ live: true })
    // Declared without a presenter: the structured value as the tool answered it.
    expect((await run('production_auth')).structuredContent).toMatchObject({ projectId: 'p1', clientId: 'cid' })
    // No shape declared: text only.
    const slots = await run('list_slots')
    expect(slots.structuredContent).toBeUndefined()
    expect(slots.content[0]!.text).toBe('This organization has no workloads yet.')
  })

  test('a refusal carries no structured part; a success of a declared tool always does; a throwing presenter answers its text as an error', async () => {
    const { run } = serve(hostOf(testProfile()))
    const refused = await run('attach_custom_domain', {})
    expect(refused.isError).toBe(true)
    expect(refused.structuredContent).toBeUndefined()

    // A text-only success of a declared tool still answers its shape — the presenter gets `{}`.
    const textOnly = serve(hostOf(testProfile({
      presentation: { session_status: { output: { ok: z.boolean() }, present: structured => ({ ok: Object.keys(structured).length < 1 }) } },
      reportClient: false,
    })))
    expect((await textOnly.run('session_status')).structuredContent).toEqual({ ok: true })

    const broken = serve(hostOf(testProfile({
      presentation: { production_status: { output: { live: z.boolean() }, present: () => { throw new Error('presenter defect') } } },
    })))
    const answer = await broken.run('production_status')
    expect(answer.isError).toBe(true)
    expect(answer.structuredContent).toBeUndefined()
    expect(answer.content[0]!.text).toContain('custom domain shop.example.com')
    expect(broken.logged.some(line => line.startsWith('production_status presentation failed'))).toBe(true)
  })

  test('the instructions are the profile\'s, given only the names offered', () => {
    const host = hostOf(testProfile())
    const instructions = serverInstructions({ host })

    expect(instructions.startsWith('TEST PROFILE cloud: ')).toBe(true)
    const offered = instructions.slice('TEST PROFILE cloud: '.length).split(' ')
    expect(offered).toEqual(catalogueHelper.visibleTools(host).map(tool => tool.name))
    expect(offered).toContain('attach_custom_domain')
    for (const gone of ['custom_domain', 'describe_capabilities', 'inference_settings']) expect(offered).not.toContain(gone)
  })

  test('describe_platform names a split tool by its variants and never a hidden one', () => {
    const rendered = renderPlatform(PLATFORM_CATALOGUE, hostOf(testProfile()))

    for (const gone of ['custom_domain', 'describe_capabilities', 'inference_settings', 'set_inference_mode']) {
      expect([gone, names(rendered, gone)]).toEqual([gone, false])
    }
    expect(rendered).toContain('production_control, attach_custom_domain, verify_custom_domain, production_auth')
    // A group whose every tool is hidden says why, as on any host that hides it.
    expect(rendered).toContain('Who performs the model calls — ')
  })

  test('session_status reports how the platform sees the connection — and tolerates a platform that cannot say', async () => {
    const view: ConnectClientView = { kind: 'viable-claude', version: '0.1.19-rc.1', via: 'connect', inference: false }
    const reported = await serve(hostOf(testProfile()), async () => view).run('session_status')
    expect(reported.content[0]!.text.split('\n').at(-1))
      .toBe('The platform sees this connection as viable-claude 0.1.19-rc.1 (via connect) — it never performs the platform\'s model calls.')

    const older = await serve(hostOf(testProfile())).run('session_status')
    expect(older.content[0]!.text.split('\n').at(-1)).toBe('The platform does not report how it sees this connection.')

    const failing = serve(hostOf(testProfile()), async () => { throw new Error('ECONNRESET') })
    const failed = await failing.run('session_status')
    expect(failed.isError).toBeUndefined()
    expect(failed.content[0]!.text.split('\n').at(-1)).toBe('The platform does not report how it sees this connection.')
    expect(failing.logged.some(line => line.includes('did not report this connection'))).toBe(true)

    const silent = await serve(hostOf(testProfile({ reportClient: false })), async () => view).run('session_status')
    expect(silent.content[0]!.text).not.toContain('sees this connection')
  })
})

describe('viable-sdk — without a profile nothing changes', () => {
  test('the model is the identity, and registration declares no output schema and keeps every structured result', async () => {
    const model = makeToolProfileModel()
    const visible = catalogueHelper.visibleTools(hostOf())
    const answer: McpToolAnswer = { content: [{ type: 'text', text: 'x' }], structuredContent: { a: 1 } }

    expect(model.profile).toBeNull()
    expect(model.apply(visible)).toEqual(visible)
    expect(model.apply(visible).every((tool, at) => tool === visible[at])).toBe(true)
    expect(model.namesOf('custom_domain')).toEqual(['custom_domain'])
    expect(model.presentationOf('custom_domain')).toBeUndefined()
    expect(model.answer('custom_domain', answer, {})).toBe(answer)

    const { configs, run } = serve(hostOf())
    expect([...configs.values()].some(config => 'outputSchema' in config)).toBe(false)
    expect([...configs.values()].every(config =>
      Object.keys(config).join(',') === 'title,description,inputSchema,annotations')).toBe(true)
    expect((await run('custom_domain', { action: 'verify' })).structuredContent).toMatchObject({ projectId: 'p1' })
  })
})

describe('viable-sdk — the listing profiles', () => {
  const listings = [listingProfile, claudeListingProfile, openaiListingProfile]

  test('hide the self-description, the agent setup and the inference switch, and report the client', () => {
    expect([...LISTING_HIDDEN].sort())
      .toEqual(['describe_capabilities', 'describe_harness', 'inference_settings', 'install_harness', 'set_inference_mode'])
    expect(new Set([...listings, localPluginProfile].map(profile => profile.name)).size).toBe(4)
    for (const profile of [...listings, localPluginProfile]) {
      expect(profile.hidden).toEqual(LISTING_HIDDEN)
      expect(profile.reportClient).toBe(true)
    }
    expect(makeListingProfile({ name: 'x', hidden: ['list_slots'], reportClient: false }))
      .toMatchObject({ hidden: [...LISTING_HIDDEN, 'list_slots'], reportClient: false, splits: [], presentation: {} })
  })

  test('their instructions drop the recommendation and name no tool the host does not offer', () => {
    const extension = { ...catalogueHelper.toolByName('list_slots')!, name: 'describe_harness' }
    const cases: Array<[ToolProfile, ToolHost]> = [
      ...listings.map(profile => [profile, hostOf(profile, { extensions: [extension] })] as [ToolProfile, ToolHost]),
      [localPluginProfile, hostOf(localPluginProfile, {
        kind: ToolHostKind.Stdio, target: ConnectTarget.Local, hasExecutor: true, harness: ConnectHarness.ClaudeCode,
      })],
    ]
    for (const [profile, host] of cases) {
      const instructions = serverInstructions({ host })
      const offered = catalogueHelper.visibleTools(host).map(tool => tool.name)

      expect(instructions).not.toContain(PREFER)
      expect(instructions).toContain('implements user stories on request.\n')
      expect(instructions).toContain('Workflow: create_project → project_status → confirm_project')
      for (const gone of profile.hidden) expect([profile.name, gone, names(instructions, gone)]).toEqual([profile.name, gone, false])
      for (const gone of profile.hidden) expect(offered).not.toContain(gone)
      expect(instructions).toContain('the account (list_access_tokens, privacy_choices, pickup_intent)')
      const rendered = renderPlatform(PLATFORM_CATALOGUE, host)
      for (const gone of profile.hidden) expect([profile.name, gone, names(rendered, gone)]).toEqual([profile.name, gone, false])
    }
  })

  test('the local plugin keeps the local tools and the question loop, and never the task loop', () => {
    const host = hostOf(localPluginProfile, {
      kind: ToolHostKind.Stdio, target: ConnectTarget.Local, hasExecutor: true, harness: ConnectHarness.Codex,
    })
    const offered = catalogueHelper.visibleTools(host).map(tool => tool.name)

    expect(offered).toEqual(expect.arrayContaining([
      'local_status', 'run_local', 'stop_local', 'local_setup_guide', 'set_local_service', 'next_question', 'answer_question',
    ]))
    expect(offered).not.toContain('next_task')
    expect(offered).not.toContain('submit_task_result')
  })
})

describe('viable-sdk — the profile seam is public', () => {
  test('the annotation presets, the profile model and the listing profiles leave through the root and ./tools', () => {
    for (const barrel of [root, tools] as Array<Record<string, unknown>>) {
      expect(barrel.READ_ONLY).toBe(READ_ONLY)
      expect(barrel.WRITE).toBe(WRITE)
      expect(barrel.IDEMPOTENT_WRITE).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false })
      expect(barrel.DESTRUCTIVE).toEqual({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false })
      expect(typeof barrel.makeToolProfileModel).toBe('function')
      expect(typeof barrel.makeListingProfile).toBe('function')
      expect(barrel.listingProfile).toBe(listingProfile)
      expect(barrel.claudeListingProfile).toBe(claudeListingProfile)
      expect(barrel.openaiListingProfile).toBe(openaiListingProfile)
      expect(barrel.localPluginProfile).toBe(localPluginProfile)
      expect(barrel.LISTING_HIDDEN).toBe(LISTING_HIDDEN)
      expect(typeof (barrel.instructionsHelper as { compose?: unknown }).compose).toBe('function')
    }
  })
})
