import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import {
  ConnectConsentRequired, ConnectHarness, ConnectLlm, ConnectOutOfCredits, ConnectTarget, type ConnectClientView,
} from '@owlmeans/viable-common'

import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { EXTENSION_TOOLS, PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import {
  APP_GRANT_ACTIONS, APP_GROUP_ACTIONS, APP_ORGANIZATION_ACTIONS, APP_USER_ACTIONS, DOMAIN_ACTIONS, PREVIEW_ACTIONS,
  PRODUCTION_ACTIONS,
} from '../src/tools/consts.local.js'
import { registerCatalogue, serverInstructions } from '../src/tools/mcp.js'
import { renderPlatform } from '../src/tools/platform.js'
import { makeToolProfileModel } from '../src/tools/profile.js'
import { LISTING_HIDDEN } from '../src/tools/profile/consts.js'
import {
  claudeListingProfile, listingProfile, localPluginProfile, openaiListingProfile,
} from '../src/tools/profile/listing.js'
import { LISTING_SPLITS, LISTING_TOOLS } from '../src/tools/profile/listing/consts.local.js'
import type { ToolProfile } from '../src/tools/profile/types.js'
import { refusalHelper } from '../src/tools/refusal.js'
import type { McpServerLike, McpToolAnswer, ToolDefinition, ToolDeps, ToolHost } from '../src/tools/types.js'

/**
 * The listing profiles' CONTENT, decided per tool. The four sets below are the documented table —
 * every offered tool is in exactly the sets its behaviour puts it in, and the spec pins it.
 *
 * DESTRUCTIVE — may overwrite, delete, replace or rewrite code or data (updates, regenerations,
 * develop/modify/reinitialize, writes, discards, reverts, revocations, removals, detaches, stops that
 * end a running thing). Purely additive tools are not: create_project, confirm_project (the first
 * build of a draft), attach_project, recollect_configuration (declares new variables only),
 * backfill_project_branding (fills blanks only), pickup_intent, create_story, steer_agent,
 * next_question, answer_question, start/restart_preview, git_commit, connect_github,
 * publish_to_github (never a force push), verify_custom_domain, invite_app_user, assign_app_grant,
 * add_app_organization_member, create_app_group, add_app_group_members, run_local.
 */
const DESTRUCTIVE_SET = [
  'reinitialize_project', 'rename_project', 'delete_project', 'apply_planning_kit',
  'update_project_settings', 'set_platform_credit', 'update_project_configuration', 'update_organization_branding',
  'revoke_access_token', 'withdraw_marketing_consent',
  'update_story', 'delete_story', 'develop_story', 'reset_story', 'complete_story', 'start_story_batch',
  'cancel_story_batch', 'modify_project', 'stop_agent', 'resume_pipeline',
  'convert_project', 'proceed_conversion', 'purge_origin',
  'write_file', 'delete_file', 'stop_preview', 'rebuild_preview',
  'git_discard', 'git_revert', 'github_sync', 'disconnect_github', 'link_github_origin',
  'publish_production', 'restart_production', 'stop_production', 'attach_custom_domain', 'detach_custom_domain',
  'set_production_redirects',
  'update_app_user', 'remove_app_user', 'set_app_permission_default', 'revoke_app_grant', 'rename_app_organization',
  'update_app_organization_member', 'remove_app_organization_member', 'update_app_group', 'delete_app_group',
  'remove_app_group_members',
  'stop_local', 'set_local_service',
]

/**
 * OPEN-WORLD — an effect visible outside the person's OwlMeans account: the live production site
 * (deleting the project takes it offline too), a custom domain at its DNS provider, GitHub, a person
 * given access by e-mail, an external repository read.
 */
const OPEN_WORLD_SET = [
  'delete_project', 'convert_project',
  'connect_github', 'publish_to_github', 'github_sync', 'disconnect_github', 'github_repositories', 'link_github_origin',
  'publish_production', 'restart_production', 'stop_production', 'attach_custom_domain', 'verify_custom_domain',
  'detach_custom_domain', 'set_production_redirects',
  'invite_app_user', 'add_app_organization_member',
]

/**
 * CREDITS — the tools that start model work the organization pays for (the balance and allowance
 * gates of the platform: the Create, Story and Conversion gates, free flight, a run's re-entry, the
 * reinitialization's record admission) or a billed model call of their own (the story rewording,
 * the configuration's re-collection, the purge's document rewrite).
 */
const CREDIT_SET = [
  'create_project', 'confirm_project', 'reinitialize_project', 'recollect_configuration', 'create_story',
  'update_story', 'develop_story', 'start_story_batch', 'modify_project', 'rename_project', 'resume_pipeline',
  'answer_question', 'convert_project', 'proceed_conversion', 'purge_origin',
]

/** NOT IDEMPOTENT — a write whose second call repeats its effect (another record, another paid run). */
const REPEATING_SET = [
  'create_project', 'reinitialize_project', 'recollect_configuration', 'pickup_intent', 'create_story',
  'update_story', 'develop_story', 'start_story_batch', 'modify_project', 'steer_agent', 'rename_project',
  'resume_pipeline', 'next_question', 'answer_question', 'convert_project', 'proceed_conversion',
  'restart_preview', 'rebuild_preview', 'git_commit', 'git_revert', 'connect_github', 'publish_to_github',
  'github_sync', 'publish_production', 'restart_production', 'run_local',
]

/** The offered tools that never answer a structured part, and so declare no output. */
const TEXT_ONLY = ['describe_platform', 'delete_story', 'answer_question', 'stop_local']

const FORBIDDEN = /prefer it over|viable mcp|next_task|submit_task_result|delegated|install_harness/i
const HOSTED_FORBIDDEN = /session|delegated|harness|run_local|local run|on this machine|subagent/i
const LOCAL_FORBIDDEN = /delegated|next_task|submit_task_result|subagent/i
const REPEATS = /calling it again|each call/i

const CLOUD_ONLY_SPLITS = ['custom_domain', 'preview_control', 'production_control']

const hostedHost = (profile: ToolProfile): ToolHost => ({
  kind: ToolHostKind.Http, target: ConnectTarget.Cloud, llm: ConnectLlm.Cloud, harness: ConnectHarness.Other,
  hasExecutor: false, profile,
})

const localHost = (profile: ToolProfile): ToolHost => ({
  kind: ToolHostKind.Stdio, target: ConnectTarget.Local, llm: ConnectLlm.Cloud, harness: ConnectHarness.ClaudeCode,
  hasExecutor: true, profile,
})

const CASES: Array<[string, ToolHost]> = [
  ['listing', hostedHost(listingProfile)],
  ['listing-claude', hostedHost(claudeListingProfile)],
  ['listing-openai', hostedHost(openaiListingProfile)],
  ['local-plugin', localHost(localPluginProfile)],
]

const offeredOf = (host: ToolHost): ToolDefinition[] => catalogueHelper.visibleTools(host)

const isHosted = (host: ToolHost): boolean => host.kind === ToolHostKind.Http

/** Every name a text could mention as a tool: the catalogue's, the agent-setup pair, the split variants. */
const TOOL_NAMES = new Set([
  ...catalogue.map(tool => tool.name), ...EXTENSION_TOOLS,
  ...LISTING_SPLITS.flatMap(split => split.variants.map(variant => variant.name)),
])

const toolsNamed = (text: string): string[] =>
  [...new Set(text.match(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g) ?? [])].filter(name => TOOL_NAMES.has(name))

const fieldDescriptions = (tool: ToolDefinition): string[] => Object.values(tool.input)
  .map(field => (field as z.ZodType).description)
  .filter((said): said is string => typeof said === 'string')

/** Registers a host's catalogue on a recording server; `api` answers the calls a test makes. */
const serve = (host: ToolHost, api: Record<string, unknown> = {}) => {
  const configs = new Map<string, Record<string, unknown>>()
  const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<McpToolAnswer>>()
  const notified: string[] = []
  const server: McpServerLike = {
    registerTool: (name, config, cb) => {
      configs.set(name, config as Record<string, unknown>)
      callbacks.set(name, cb)
    },
  }
  const deps = {
    host,
    api,
    session: async () => { throw new Error('no session on this host') },
    currentSession: () => null,
    attached: () => 'p1',
    attach: () => undefined,
    log: () => undefined,
    notify: (_level: string, text: string) => { notified.push(text) },
  } as unknown as ToolDeps
  const registered = registerCatalogue(server, deps)
  const run = async (name: string, args: Record<string, unknown> = {}): Promise<McpToolAnswer> => {
    const cb = callbacks.get(name)
    if (cb == null) throw new Error(`no tool ${name}`)

    return await cb(args)
  }

  return { registered, configs, run, notified }
}

describe('viable-sdk — the listing profiles offer', () => {
  test('nothing hidden, and never the task loop', () => {
    for (const [name, host] of CASES) {
      const offered = offeredOf(host).map(tool => tool.name)
      for (const gone of [...LISTING_HIDDEN, 'next_task', 'submit_task_result']) {
        expect([name, gone, offered.includes(gone)]).toEqual([name, gone, false])
      }
    }
  })

  test('every split as its variants — the base never — each variant taking exactly its action\'s fields', () => {
    expect(LISTING_SPLITS.map(split => split.tool).sort()).toEqual([
      'custom_domain', 'manage_app_grant', 'manage_app_group', 'manage_app_organization', 'manage_app_user',
      'preview_control', 'production_control',
    ])
    const actions: Record<string, readonly string[]> = {
      custom_domain: DOMAIN_ACTIONS, preview_control: PREVIEW_ACTIONS, production_control: PRODUCTION_ACTIONS,
      manage_app_user: APP_USER_ACTIONS, manage_app_grant: APP_GRANT_ACTIONS,
      manage_app_organization: APP_ORGANIZATION_ACTIONS, manage_app_group: APP_GROUP_ACTIONS,
    }
    for (const split of LISTING_SPLITS) {
      expect([split.tool, split.argument, split.variants.map(variant => variant.value)])
        .toEqual([split.tool, 'action', [...actions[split.tool]!]])
      const base = catalogueHelper.toolByName(split.tool)!
      for (const variant of split.variants) {
        // A field the base does not take is a typo the narrowing would silently drop.
        expect([variant.name, variant.fields.filter(field => !(field in base.input))]).toEqual([variant.name, []])
        expect(variant.fields).not.toContain('action')
      }
    }

    for (const [name, host] of CASES) {
      const offered = offeredOf(host)
      const names = offered.map(tool => tool.name)
      for (const split of LISTING_SPLITS) {
        const cloudOnly = CLOUD_ONLY_SPLITS.includes(split.tool)
        expect([name, split.tool, names.includes(split.tool)]).toEqual([name, split.tool, false])
        for (const variant of split.variants) {
          const present = !cloudOnly || isHosted(host)
          expect([name, variant.name, names.includes(variant.name)]).toEqual([name, variant.name, present])
          const tool = offered.find(one => one.name === variant.name)
          if (tool == null) continue
          expect([variant.name, Object.keys(tool.input).sort()]).toEqual([variant.name, [...variant.fields].sort()])
          expect([tool.title, tool.description, tool.annotations]).toEqual([variant.title, variant.description, variant.annotations])
        }
      }
    }
  })

  test('the generated application\'s sign-in on the local plugin too, and its local tools and question loop', () => {
    const names = offeredOf(localHost(localPluginProfile)).map(tool => tool.name)
    expect(names).toEqual(expect.arrayContaining([
      'invite_app_user', 'update_app_user', 'remove_app_user', 'assign_app_grant', 'revoke_app_grant',
      'rename_app_organization', 'add_app_organization_member', 'update_app_organization_member',
      'remove_app_organization_member', 'create_app_group', 'update_app_group', 'delete_app_group',
      'add_app_group_members', 'remove_app_group_members',
      'local_status', 'run_local', 'stop_local', 'local_setup_guide', 'set_local_service', 'next_question', 'answer_question',
    ]))
  })
})

describe('viable-sdk — the listing profiles present', () => {
  test('a declared output for every offered tool but the text-only ones, convertible as tools/list carries it', () => {
    for (const [name, host] of CASES) {
      const model = makeToolProfileModel(host.profile)
      for (const tool of offeredOf(host)) {
        const output = model.presentationOf(tool.name)?.output
        const declared = !TEXT_ONLY.includes(tool.name)
        expect([name, tool.name, output != null]).toEqual([name, tool.name, declared])
        if (output == null) continue
        const schema = z.toJSONSchema(z.object(output), { target: 'draft-7', io: 'output' })
        expect([tool.name, schema.type]).toEqual([tool.name, 'object'])
      }
    }
  })

  test('the text-only tools answer text alone — describe_platform among them', async () => {
    const answer = await serve(hostedHost(listingProfile)).run('describe_platform')
    expect(answer.structuredContent).toBeUndefined()
    expect(answer.content[0]!.text).toContain('WHAT YOU CAN CALL')
  })

  test('an annotation decided for every offered tool, by the documented rules', () => {
    const variants = new Set(LISTING_SPLITS.flatMap(split => split.variants.map(variant => variant.name)))
    const seen = new Map<string, ToolDefinition>()
    for (const [name, host] of CASES) {
      for (const tool of offeredOf(host)) {
        // Every offered tool's annotation is the listing's own decision, never inherited unexamined.
        expect([name, tool.name, variants.has(tool.name) || LISTING_TOOLS[tool.name]?.annotations != null])
          .toEqual([name, tool.name, true])
        seen.set(tool.name, tool)
      }
    }
    const tools = [...seen.values()]
    const where = (hint: 'destructiveHint' | 'openWorldHint'): string[] =>
      tools.filter(tool => tool.annotations[hint] === true).map(tool => tool.name).sort()

    for (const tool of tools) {
      const { readOnlyHint, destructiveHint, idempotentHint } = tool.annotations
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
        expect([tool.name, hint, typeof tool.annotations[hint]]).toEqual([tool.name, hint, 'boolean'])
      }
      if (readOnlyHint === true) expect([tool.name, destructiveHint, idempotentHint]).toEqual([tool.name, false, true])
    }
    expect(where('destructiveHint')).toEqual([...DESTRUCTIVE_SET].sort())
    expect(where('openWorldHint')).toEqual([...OPEN_WORLD_SET].sort())
    expect(tools.filter(tool => tool.annotations.readOnlyHint !== true && tool.annotations.idempotentHint !== true)
      .map(tool => tool.name).sort()).toEqual([...REPEATING_SET].sort())
  })

  test('descriptions that say what spends credits and what repeats, and nothing a listing may not carry', () => {
    for (const [name, host] of CASES) {
      const offered = offeredOf(host)
      const names = new Set(offered.map(tool => tool.name))
      for (const tool of offered) {
        const texts = [tool.title, tool.description, ...fieldDescriptions(tool)]
        for (const said of texts) expect([name, tool.name, FORBIDDEN.test(said)]).toEqual([name, tool.name, false])
        if (CREDIT_SET.includes(tool.name)) {
          expect([tool.name, /credits/i.test(tool.description)]).toEqual([tool.name, true])
        }
        if (tool.annotations.readOnlyHint !== true && tool.annotations.idempotentHint !== true) {
          expect([tool.name, REPEATS.test(tool.description)]).toEqual([tool.name, true])
        }
        // A description names only what this listing offers.
        expect([name, tool.name, toolsNamed(tool.description).filter(one => !names.has(one))])
          .toEqual([name, tool.name, []])
      }
    }
  })
})

describe('viable-sdk — the listing profiles\' instructions', () => {
  test('a store preface, then the base text naming only offered tools', () => {
    for (const [name, host] of CASES) {
      const instructions = serverInstructions({ host })
      const offered = new Set(offeredOf(host).map(tool => tool.name))

      expect(instructions.startsWith('OwlMeans builds full-stack web applications from a description')).toBe(true)
      expect(instructions).toContain('bills to the organization in credits')
      expect(instructions).toContain('refuses without confirm: true')
      expect(instructions).toContain('managed by the user in the OwlMeans web application')
      expect(FORBIDDEN.test(instructions)).toBe(false)
      expect(/viable/i.test(instructions)).toBe(false)
      expect([name, toolsNamed(instructions).filter(tool => !offered.has(tool))]).toEqual([name, []])
      // The variants stand where their base would: the production family names the domain actions.
      if (isHosted(host)) {
        expect(instructions).toContain('attach_custom_domain, verify_custom_domain, detach_custom_domain')
        expect([name, HOSTED_FORBIDDEN.exec(instructions)?.[0] ?? null]).toEqual([name, null])
        expect(instructions).not.toContain('Workspace:')
      } else {
        expect([name, LOCAL_FORBIDDEN.exec(instructions)?.[0] ?? null]).toEqual([name, null])
        expect(instructions).toContain('writes the project\'s files into the directory this server runs in')
        expect(instructions).toContain('Do not edit those files while a platform run is active')
      }
    }
  })

  test('describe_platform, as a listing answers it, names no hidden or split tool', async () => {
    for (const [name, host] of CASES) {
      const answer = await serve(host).run('describe_platform')
      const text = answer.content[0]!.text
      const offered = new Set(offeredOf(host).map(tool => tool.name))

      expect([name, toolsNamed(text).filter(tool => !offered.has(tool))]).toEqual([name, []])
      expect(text).not.toContain('deliberately not offered through a connector')
      expect(text).toContain('Credits, billing and the plan are managed by the user in the OwlMeans web application')
      expect(renderPlatform(PLATFORM_CATALOGUE, { ...host, profile: undefined }))
        .toContain('deliberately not offered through a connector')
    }
  })
})

describe('viable-sdk — the listing profiles\' text', () => {
  const text = listingProfile.text!

  test('names a split tool by the variant a hint means, keeping the other fields', () => {
    expect(text('custom domain: none — custom_domain { action: attach, domain } attaches one'))
      .toBe('custom domain: none — attach_custom_domain { domain } attaches one')
    expect(text('next: once the records are in place, custom_domain { action: verify } asks the provider again;'))
      .toBe('next: once the records are in place, verify_custom_domain asks the provider again;')
    expect(text('a restriction — manage_app_grant { action: revoke, mode: inherit } lifts it.'))
      .toBe('a restriction — revoke_app_grant { mode: inherit } lifts it.')
    expect(text('the preview is stopped — preview_control { action: start } starts it.'))
      .toBe('the preview is stopped — start_preview starts it.')
    expect(text('production_control {"action":"restart"} brings it back'))
      .toBe('restart_production brings it back')
  })

  test('a bare mention by the answering variant, or by every variant; the task loop by the status to read', () => {
    expect(text('Never the preview: that is preview_control.'))
      .toBe('Never the preview: that is start_preview / restart_preview / stop_preview / rebuild_preview.')
    expect(text('refused — manage_app_user needs an email', 'invite_app_user')).toBe('refused — invite_app_user needs an email')
    expect(text('restricted with manage_app_grant (group).', 'create_app_group'))
      .toBe('restricted with assign_app_grant / revoke_app_grant (group).')
    expect(text('attach_custom_domain stays attach_custom_domain')).toBe('attach_custom_domain stays attach_custom_domain')
    expect(text('next: next_task')).toBe('next: project_status')
    // A file's own content is the user's.
    expect(text('custom_domain { action: attach }', 'read_file')).toBe('custom_domain { action: attach }')
  })

  test('without a profile, or a profile with no rewrite, nothing is rewritten', () => {
    expect(makeToolProfileModel().text('custom_domain { action: attach }')).toBe('custom_domain { action: attach }')
    const plain = { ...listingProfile, text: undefined }
    const answer: McpToolAnswer = { content: [{ type: 'text', text: 'custom_domain { action: verify }' }], isError: true }
    expect(makeToolProfileModel(plain).answer('verify_custom_domain', answer, {}).content[0]!.text)
      .toBe('custom_domain { action: verify }')
  })

  test('a balance refusal says credits are managed in the web application — no top-up or billing address', () => {
    const topUp = 'https://vib.example/?top-up=story'
    const outOfCredits = refusalHelper.personRefusalPhrase(
      new ConnectOutOfCredits(ConnectOutOfCredits.encode('story', 2.5, 0.4, topUp)))!
    const consent = refusalHelper.personRefusalPhrase(new ConnectConsentRequired(
      ConnectConsentRequired.encode('story', 'https://vib.example/account/billing?consent=1', new Date('2026-11-10T00:00:00Z'))))!
    const bare402 = refusalHelper.refusalPhrase(new Error('api:client:status:402'))
    // The base phrases carry the address and the top-up call to action — a listing says neither.
    expect(outOfCredits).toContain(topUp)
    expect(consent).toContain('https://vib.example/account/billing?consent=1')

    for (const phrase of [outOfCredits, consent, bare402]) {
      const said = text(phrase)
      expect([said, /https?:\/\//.test(said), /top up|top-up/i.test(said)]).toEqual([said, false, false])
    }
    expect(text(outOfCredits)).toContain('Credits are managed in the OwlMeans web application')
    expect(text(outOfCredits)).toContain('it needs about $2.50 and the account has $0.40 left. Nothing was started.')
    expect(text(bare402)).toContain('Credits are managed in the OwlMeans web application')
    expect(text(consent)).toContain('Ask the user to open Billing in the OwlMeans web application and confirm there')
    // Any other billing address left in a text is said as the place, its punctuation kept.
    expect(text(`see ${topUp}.`)).toBe('see the OwlMeans web application.')
    expect(text('docs at https://owlmeans.com/docs.')).toBe('docs at https://owlmeans.com/docs.')
  })

  test('the refusal and its notification through a registered listing — the plain host keeps its link', async () => {
    const topUp = 'https://vib.example/?top-up=create'
    const api = {
      project: { create: async () => { throw new ConnectOutOfCredits(ConnectOutOfCredits.encode('create', 1, 0, topUp)) } },
    }
    const listed = serve(hostedHost(openaiListingProfile), api)
    const refused = await listed.run('create_project', { prompt: 'A bakery shop' })
    expect(refused.isError).toBe(true)
    expect(refused.content[0]!.text).not.toContain('http')
    expect(refused.content[0]!.text).toContain('Credits are managed in the OwlMeans web application')
    expect(listed.notified).toHaveLength(1)
    expect(listed.notified[0]).not.toContain('http')

    const plain = serve({ ...hostedHost(openaiListingProfile), profile: undefined }, api)
    const unchanged = await plain.run('create_project', { prompt: 'A bakery shop' })
    expect(unchanged.content[0]!.text).toContain(`Ask the user to top up here: ${topUp}`)
    expect(plain.notified[0]).toContain(topUp)
  })
})

describe('viable-sdk — a listing registered on an MCP server', () => {
  test('registers exactly what it offers, each declared output as a JSON-schema-convertible outputSchema', () => {
    for (const [name, host] of CASES) {
      const { registered, configs } = serve(host)
      expect([name, registered]).toEqual([name, offeredOf(host).map(tool => tool.name)])
      for (const [tool, config] of configs) {
        if (!('outputSchema' in config)) {
          expect([name, tool, TEXT_ONLY.includes(tool)]).toEqual([name, tool, true])
          continue
        }
        const schema = z.toJSONSchema(z.object(config.outputSchema as z.ZodRawShape), { target: 'draft-7', io: 'output' })
        expect([name, tool, schema.type, JSON.stringify(schema).includes('$ref')]).toEqual([name, tool, 'object', false])
      }
    }
  })

  test('session_status answers how the platform sees the connection, in its declared shape', async () => {
    const view: ConnectClientView = { kind: 'hosted-openai', version: '1.0.0', via: 'mcp', inference: false }
    const { run, configs } = serve(hostedHost(openaiListingProfile), { client: async () => view })
    const answer = await run('session_status')
    const schema = z.object(configs.get('session_status')!.outputSchema as z.ZodRawShape).strict()

    expect(answer.structuredContent).toEqual({ client: view })
    expect(schema.safeParse(answer.structuredContent).success).toBe(true)
    expect(answer.content[0]!.text).toContain('The platform sees this connection as hosted-openai 1.0.0 (via mcp)')

    const older = await serve(hostedHost(openaiListingProfile), { client: async () => null }).run('session_status')
    expect(older.structuredContent).toEqual({ client: null })
    expect(schema.safeParse(older.structuredContent).success).toBe(true)
  })

  test('a split variant runs its base with the action fixed, its answer said with the offered names', async () => {
    const { run } = serve(hostedHost(claudeListingProfile), {
      production: {
        domain: {
          attach: async () => null,
        },
      },
    })
    const answer = await run('attach_custom_domain', { domain: 'shop.example.com', action: 'detach' })
    expect(answer.isError).toBe(true)
    expect(answer.content[0]!.text).toContain('publish_production first')
  })
})
