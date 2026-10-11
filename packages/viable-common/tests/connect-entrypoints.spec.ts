import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { aliasOf, protocols } from '@owlmeans/entrypoint'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { RouteMethod, RouteProtocols } from '@owlmeans/route'
import {
  connect, CONNECT_BRANDING_GOOGLE_TAG_MAX, CONNECT_CALL_ACCEPT_MS, CONNECT_CALL_COLLECT_WAIT_SEC,
  CONNECT_CALL_HEADER, CONNECT_CALL_LOST_MS, CONNECT_CONFIG_SAVE_MAX, CONNECT_FILE_PATH_MAX, CONNECT_PRIVACY_KEYS_MAX,
  CONNECT_REDIRECTS_MAX, CONNECT_TOKEN_ID_MAX, ConnectCallState, ConnectPaidGate,
  CONNECT_FEED_LIMIT_MAX, CONNECT_FEED_START, CONNECT_FEED_WAIT_MAX_SEC, ConnectFeedDetail, ConnectFeedKind,
} from '../src/connect/consts.js'
import {
  ConnectAccessTokenParamsSchema, ConnectIntentPickupBodySchema, ConnectLlmBodySchema, ConnectPrivacyWithdrawBodySchema,
  ConnectProjectLlmBodySchema, ConnectBrandingCreditBodySchema, ConnectCallCollectParamsSchema, ConnectCallCollectQuerySchema, ConnectConfigSaveBodySchema,
  ConnectOrganizationBrandingSaveSchema, ConnectScopeQuerySchema, ConnectCallPendingSchema, ConnectCallResultSchema,
  ConnectConvertProceedBodySchema, ConnectCreateBodySchema, ConnectFileMetaQuerySchema, ConnectFileQuerySchema,
  ConnectFileSaveBodySchema, ConnectGitCommitBodySchema, ConnectGitRevertBodySchema, ConnectGithubBranchQuerySchema,
  ConnectGithubLinkBodySchema, ConnectGithubPublishBodySchema, ConnectGithubRepoQuerySchema, ConnectKitApplyBodySchema,
  ConnectProductionDomainBodySchema, ConnectProductionRedirectsBodySchema, ConnectKitApplyResultSchema, ConnectKitDescribeSchema, ConnectProjectBrandingSaveSchema,
  PlanningKitViewSchema, ConnectActivityQuerySchema, ConnectFeedQuerySchema,
} from '../src/connect/schemas.js'
import { connectProtocols } from '../src/connect/entrypoints.js'
import { connectRef } from '../src/connect/references.js'

describe('@owlmeans/viable-common — connector protocol tree', () => {
  const tree = connectProtocols({ guard: DEFAULT_GUARD })

  test('exports named immutable declarations and a complete flat materialization view', () => {
    expect(tree.base.alias).toBe(connect.base)
    expect(tree.session.open.alias).toBe(connect.session.open)
    expect(tree.story.status.alias).toBe(connect.story.status)
    expect(tree.convert.proceed.alias).toBe(connect.convert.proceed)
    expect(tree.inquiry.answer.alias).toBe(connect.inquiry.answer)
    expect(tree.files.list.alias).toBe(connect.files.list)
    expect(tree.account.base.alias).toBe(connect.account.base)
    expect(tree.project.destroy.alias).toBe(connect.project.destroy)
    expect(tree.project.unlock.alias).toBe(connect.project.unlock)
    expect(tree.files.save.alias).toBe(connect.files.save)
    expect(tree.sandbox.run.alias).toBe(connect.sandbox.run)
    expect(tree.slot.list.alias).toBe(connect.slot.list)
    expect(tree.config.get.alias).toBe(connect.config.get)
    expect(tree.account.branding.save.alias).toBe(connect.account.branding.save)
    expect(tree.account.llm.set.alias).toBe(connect.account.llm.set)
    expect(tree.account.tokens.revoke.alias).toBe(connect.account.tokens.revoke)
    expect(tree.account.privacy.withdraw.alias).toBe(connect.account.privacy.withdraw)
    expect(tree.account.intent.pickup.alias).toBe(connect.account.intent.pickup)
    expect(tree.project.llm.set.alias).toBe(connect.project.llm.set)
    expect(tree.git.status.alias).toBe(connect.git.status)
    expect(tree.github.authorize.alias).toBe(connect.github.authorize)
    expect(tree.production.publish.alias).toBe(connect.production.publish)
    expect(tree.production.auth.get.alias).toBe(connect.production.auth.get)
    expect(tree.iam.grants.assign.alias).toBe(connect.iam.grants.assign)
    expect(tree.account.iam.users.alias).toBe(connect.account.iam.users)
    expect(protocols(tree)).toHaveLength(107)
    expect(new Set(protocols(tree).map(protocol => protocol.alias)).size).toBe(107)
  })

  test('declares exactly the routes a connector calls — every alias, reference and path, and no socket', () => {
    const declared = protocols(tree)
    const addresses = declared.filter(protocol => protocol.route.route.method != null)
      .map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`).sort()

    expect(addresses).toEqual([
      'DELETE /project/:id', 'DELETE /project/:id/files/content',
      'GET /access-tokens', 'GET /branding', 'GET /call/:callId', 'GET /convert/:id', 'GET /convert/:id/check',
      'GET /iam/users', 'GET /llm', 'GET /notifications', 'GET /pipeline/:id/:runId',
      'GET /privacy', 'GET /project', 'GET /project/:id/activity',
      'GET /project/:id/branding', 'GET /project/:id/config', 'GET /project/:id/files', 'GET /project/:id/files/changes',
      'GET /project/:id/files/content',
      'GET /project/:id/files/meta', 'GET /project/:id/git', 'GET /project/:id/git/log', 'GET /project/:id/github/branches',
      'GET /project/:id/github/repos', 'GET /project/:id/iam/grants', 'GET /project/:id/iam/organizations',
      'GET /project/:id/iam/organizations/:entitySlug/groups', 'GET /project/:id/iam/organizations/:entitySlug/groups/:group/members',
      'GET /project/:id/iam/organizations/:entitySlug/members', 'GET /project/:id/iam/permissions', 'GET /project/:id/iam/users',
      'GET /project/:id/kits', 'GET /project/:id/llm', 'GET /project/:id/production',
      'GET /project/:id/production/auth', 'GET /project/:id/status',
      'GET /project/:id/story/:storyId/status', 'GET /session/:sessionId/ops', 'GET /slot',
      'POST /access-tokens/:id/revoke', 'POST /branding', 'POST /branding/backfill',
      'POST /convert', 'POST /convert/:id/proceed', 'POST /convert/:id/purge', 'POST /convert/:id/start',
      'POST /intent/pickup', 'POST /llm',
      'POST /pipeline/:id/:runId/resume', 'POST /privacy/withdraw', 'POST /project', 'POST /project/:id/branding',
      'POST /project/:id/branding/copy-defaults', 'POST /project/:id/branding/credit',
      'POST /project/:id/config', 'POST /project/:id/config/recollect', 'POST /project/:id/confirm', 'POST /project/:id/files/content',
      'POST /project/:id/git/commit', 'POST /project/:id/git/discard', 'POST /project/:id/git/revert',
      'POST /project/:id/github/authorize', 'POST /project/:id/github/disconnect', 'POST /project/:id/github/link',
      'POST /project/:id/github/publish', 'POST /project/:id/github/pull', 'POST /project/:id/github/push',
      'POST /project/:id/iam/grants', 'POST /project/:id/iam/grants/revoke',
      'POST /project/:id/iam/organizations/:entitySlug', 'POST /project/:id/iam/organizations/:entitySlug/groups',
      'POST /project/:id/iam/organizations/:entitySlug/groups/:group',
      'POST /project/:id/iam/organizations/:entitySlug/groups/:group/members',
      'POST /project/:id/iam/organizations/:entitySlug/groups/:group/members/remove',
      'POST /project/:id/iam/organizations/:entitySlug/groups/:group/remove',
      'POST /project/:id/iam/organizations/:entitySlug/members',
      'POST /project/:id/iam/organizations/:entitySlug/members/:profileId',
      'POST /project/:id/iam/organizations/:entitySlug/members/:profileId/remove',
      'POST /project/:id/iam/permissions/default', 'POST /project/:id/iam/users', 'POST /project/:id/iam/users/:profileId',
      'POST /project/:id/iam/users/:profileId/remove',
      'POST /project/:id/inquiry/:inquiryId',
      'POST /project/:id/kits', 'POST /project/:id/llm', 'POST /project/:id/modify',
      'POST /project/:id/production/auth/redirects', 'POST /project/:id/production/domain/attach',
      'POST /project/:id/production/domain/detach', 'POST /project/:id/production/domain/verify',
      'POST /project/:id/production/publish', 'POST /project/:id/production/restart', 'POST /project/:id/production/stop',
      'POST /project/:id/reinit', 'POST /project/:id/rename',
      'POST /project/:id/sandbox/rebuild', 'POST /project/:id/sandbox/restart', 'POST /project/:id/sandbox/run',
      'POST /project/:id/sandbox/stop', 'POST /project/:id/unlock', 'POST /project/attach', 'POST /session',
      'POST /session/:sessionId/close', 'POST /session/:sessionId/ops/:opId', 'POST /session/delegated',
    ])
    expect(declared.every(protocol => protocol.route.route.protocol !== RouteProtocols.SOCKET)).toBe(true)
    // The alias table, the tree and the typed references name the same routes.
    const leaves = (value: object): string[] => Object.values(value).flatMap(entry =>
      typeof entry === 'string' ? [entry] : 'alias' in entry ? [entry.alias as string] : leaves(entry))
    expect(leaves(connect).sort()).toEqual(declared.map(protocol => protocol.alias).sort())
    const bases = [connect.base, connect.account.base]
    expect(leaves(connectRef).sort()).toEqual(declared.map(protocol => protocol.alias).filter(alias => !bases.includes(alias)).sort())
  })

  test('reads and saves a project\'s branding at one path, under the owned base and no paid gate', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      localLlm: { alias: 'test-paid-llm', params: ['cap'] },
    })
    const get = paid.project.branding.get
    const save = paid.project.branding.save

    expect(get.alias).toBe(connect.project.branding.get)
    expect(save.alias).toBe(connect.project.branding.save)
    expect(get.route.route.path).toBe('/project/:id/branding')
    expect(save.route.route.path).toBe('/project/:id/branding')
    expect(get.route.route.method).toBe(RouteMethod.GET)
    expect(save.route.route.method).toBe(RouteMethod.POST)
    expect(aliasOf(get.route.route.parent)).toBe(connect.base)
    expect(aliasOf(save.route.route.parent)).toBe(connect.base)
    // The paid local-LLM gate sits on the delegated session and the two preference writes alone; the
    // text settings carry no gate of their own and inherit only the base's guard and ownership gate.
    expect(paid.session.openDelegated.gate?.alias).toBe('test-paid-llm')
    expect(protocols(paid).filter(protocol => protocol.gate?.alias === 'test-paid-llm'))
      .toEqual([paid.account.llm.set, paid.session.openDelegated, paid.project.llm.set])
    expect(get.gate).toBeUndefined()
    expect(save.gate).toBeUndefined()
    expect(connectRef.project.branding.save.alias).toBe(connect.project.branding.save)
    expect(connectRef.project.branding.get.alias).toBe(connect.project.branding.get)
  })

  test('the credit switch and the organization defaults copy hang under the project\'s branding path', () => {
    const { credit, copyDefaults } = tree.project.branding

    expect([credit.route.route.path, copyDefaults.route.route.path])
      .toEqual(['/project/:id/branding/credit', '/project/:id/branding/copy-defaults'])
    expect([credit.route.route.method, copyDefaults.route.route.method]).toEqual([RouteMethod.POST, RouteMethod.POST])
    expect([aliasOf(credit.route.route.parent), aliasOf(copyDefaults.route.route.parent)]).toEqual([connect.base, connect.base])
    expect([connectRef.project.branding.credit.alias, connectRef.project.branding.copyDefaults.alias])
      .toEqual([connect.project.branding.credit, connect.project.branding.copyDefaults])
    const body = new Ajv({ strict: false }).compile(ConnectBrandingCreditBodySchema)
    expect(body({ hideCredit: true })).toBe(true)
    expect(body({})).toBe(false)
    expect(body({ hideCredit: 'yes' })).toBe(false)
  })

  test('the configuration routes sit under the owned base, no paid gate; a scope is preview or production', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      paid: Object.fromEntries(Object.values(ConnectPaidGate).map(kind => [kind, { alias: `gate-${kind}`, params: [kind] }])),
    })
    const { get, save, recollect } = paid.config

    expect([get, save, recollect].map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`))
      .toEqual(['GET /project/:id/config', 'POST /project/:id/config', 'POST /project/:id/config/recollect'])
    expect([get, save, recollect].map(protocol => aliasOf(protocol.route.route.parent))).toEqual([connect.base, connect.base, connect.base])
    expect([get, save, recollect].map(protocol => protocol.gate)).toEqual([undefined, undefined, undefined])
    expect(connectRef.config.save.alias).toBe(connect.config.save)

    const scope = new Ajv({ strict: false }).compile(ConnectScopeQuerySchema)
    expect(scope({})).toBe(true)
    expect(scope({ scope: 'production' })).toBe(true)
    expect(scope({ scope: 'ephemeral' })).toBe(true)
    expect(scope({ scope: null })).toBe(true)
    expect(scope({ scope: 'local' })).toBe(false)
  })

  test('a configuration save is a closed patch of environment variable names and values', () => {
    const validate = new Ajv({ strict: false }).compile(ConnectConfigSaveBodySchema)

    expect(validate({})).toBe(true)
    expect(validate({ backend: [{ name: 'STRIPE_KEY', value: 'sk_test' }], frontend: [{ name: 'PUBLIC_URL', value: '' }] })).toBe(true)
    expect(validate({ backend: [{ name: '1BAD', value: 'x' }] })).toBe(false)
    expect(validate({ backend: [{ name: 'WITH-DASH', value: 'x' }] })).toBe(false)
    expect(validate({ backend: [{ name: 'KEY' }] })).toBe(false)
    expect(validate({ backend: [{ name: 'KEY', value: 'x', set: true }] })).toBe(false)
    expect(validate({ secrets: [] })).toBe(false)
    const many = Array.from({ length: CONNECT_CONFIG_SAVE_MAX + 1 }, (_, at) => ({ name: `K${at}`, value: '' }))
    expect(validate({ frontend: many })).toBe(false)
  })

  test('the organization defaults are read, patched and backfilled under the account base', () => {
    const { get, save, backfill } = tree.account.branding

    expect([get, save, backfill].map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`))
      .toEqual(['GET /branding', 'POST /branding', 'POST /branding/backfill'])
    expect([get, save, backfill].map(protocol => aliasOf(protocol.route.route.parent)))
      .toEqual([connect.account.base, connect.account.base, connect.account.base])
    expect(connectRef.account.branding.backfill.alias).toBe(connect.account.branding.backfill)
    const validate = new Ajv({ strict: false }).compile(ConnectOrganizationBrandingSaveSchema)
    expect(validate({ organizationName: 'Acme' })).toBe(true)
    expect(validate({ organizationName: '' })).toBe(false)
    expect(validate({ copyright: '© Acme', termsUrl: '/terms' })).toBe(false)
  })

  test('a create names the caller\'s unattached delegated session, or none', () => {
    const create = new Ajv({ strict: false }).compile(ConnectCreateBodySchema)

    expect(create({ prompt: 'A booking app' })).toBe(true)
    expect(create({ prompt: 'A booking app', target: 'local', sessionId: 'session-1' })).toBe(true)
    expect(create({ prompt: 'A booking app', sessionId: null })).toBe(true)
    expect(create({ prompt: 'A booking app', sessionId: '' })).toBe(false)
    expect(create({ prompt: 'A booking app', llmMode: 'local' })).toBe(false)
  })

  test('the branding save body is a patch of strings that can never carry the credit', () => {
    const validate = new Ajv({ strict: false }).compile(ConnectProjectBrandingSaveSchema)

    expect(validate({})).toBe(true)
    expect(validate({ googleTag: 'GTM-ABCD123', termsUrl: '/terms', privacyUrl: '' })).toBe(true)
    expect(validate({ copyright: '' })).toBe(false)
    expect(validate({ hideCredit: true })).toBe(false)
    expect(validate({ credit: { hidden: true } })).toBe(false)
    expect(validate({ googleTag: 'G-'.padEnd(CONNECT_BRANDING_GOOGLE_TAG_MAX + 1, 'X') })).toBe(false)
  })

  test('keeps story mutations in planning and exposes only the composed story status', () => {
    expect(Object.keys(tree.story)).toEqual(['status'])
    expect(Object.keys(connect.story)).toEqual(['status'])
    expect(Object.keys(connectRef.story)).toEqual(['status'])
    expect(tree.story.status.route.route.path).toBe('/project/:id/story/:storyId/status')
  })
  test('has no generic connector job endpoint', () => {
    expect((tree.project as Record<string, unknown>).job).toBeUndefined()
    expect((connect.project as Record<string, unknown>).job).toBeUndefined()
    expect((connectRef.project as Record<string, unknown>).job).toBeUndefined()
  })

  test('describes and applies planning kits at one project path, under the owned base and no paid gate', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      localLlm: { alias: 'test-paid-llm', params: ['cap'] },
    })
    const { describe: list, apply } = paid.project.kit

    expect([list.alias, apply.alias]).toEqual([connect.project.kit.describe, connect.project.kit.apply])
    expect([list.route.route.path, apply.route.route.path]).toEqual(['/project/:id/kits', '/project/:id/kits'])
    expect([list.route.route.method, apply.route.route.method]).toEqual([RouteMethod.GET, RouteMethod.POST])
    expect([aliasOf(list.route.route.parent), aliasOf(apply.route.route.parent)]).toEqual([connect.base, connect.base])
    expect([list.gate, apply.gate]).toEqual([undefined, undefined])
    expect([connectRef.project.kit.describe.alias, connectRef.project.kit.apply.alias])
      .toEqual([connect.project.kit.describe, connect.project.kit.apply])
  })

  test('the kit view, the describe reply, the apply body and its result are closed shapes', () => {
    const ajv = new Ajv({ strict: false })
    const view = ajv.compile(PlanningKitViewSchema)
    const reply = ajv.compile(ConnectKitDescribeSchema)
    const body = ajv.compile(ConnectKitApplyBodySchema)
    const result = ajv.compile(ConnectKitApplyResultSchema)
    const kit = {
      id: 'project', kind: 'project', title: 'Project tracking', purpose: 'Tasks moving to done',
      container: { key: 'workspace', label: 'Project' },
      types: [{ key: 'task', label: 'Task', flow: 'task' }],
      flows: [{ key: 'task', label: 'Task', statuses: [{ key: 'open', label: 'Open', intrinsic: 'planned' }] }],
    }

    expect(view(kit)).toBe(true)
    expect(view({ ...kit, extra: true })).toBe(false)
    expect(view({ ...kit, types: [{ key: 'task', label: 'Task' }] })).toBe(false)
    expect(reply({ kits: [kit] })).toBe(true)
    expect(body({ kit: 'project' })).toBe(true)
    expect(body({ kit: 'project', types: ['task', 'bug'] })).toBe(true)
    expect(body({ kit: 'project', types: null })).toBe(true)
    expect(body({ kit: '' })).toBe(false)
    expect(body({ types: ['task'] })).toBe(false)
    expect(body({ kit: 'project', force: true })).toBe(false)
    expect(result({ applied: ['task'], skipped: ['bug'], warnings: [] })).toBe(true)
    expect(result({ applied: ['task'], skipped: [] })).toBe(false)
  })

  test('collects a delegated write by its call id: one GET under the base guard and no paid gate', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      localLlm: { alias: 'test-paid-llm', params: ['cap'] },
    })
    const collect = paid.call.collect

    expect(collect.alias).toBe(connect.call.collect)
    expect(collect.route.route.path).toBe('/call/:callId')
    expect(collect.route.route.method).toBe(RouteMethod.GET)
    expect(aliasOf(collect.route.route.parent)).toBe(connect.base)
    expect(collect.gate).toBeUndefined()
    expect(connectRef.call.collect.alias).toBe(connect.call.collect)
    // The timing contract the platform and the connector both read.
    expect(CONNECT_CALL_HEADER).toBe('x-viable-call')
    expect([CONNECT_CALL_ACCEPT_MS, CONNECT_CALL_COLLECT_WAIT_SEC, CONNECT_CALL_LOST_MS]).toEqual([20_000, 25, 90_000])
    expect(Object.values(ConnectCallState)).toEqual(['pending', 'settled', 'lost'])
  })

  test('the pending answer, the collect params and query, and the result are closed shapes', () => {
    const ajv = new Ajv({ strict: false })
    const pending = ajv.compile(ConnectCallPendingSchema)
    const params = ajv.compile(ConnectCallCollectParamsSchema)
    const query = ajv.compile(ConnectCallCollectQuerySchema)
    const result = ajv.compile(ConnectCallResultSchema)
    const id = '0b6f6c1e-8d4c-4a57-9f2a-3c1d2e4f5a6b'

    expect(pending({ pending: id })).toBe(true)
    expect(pending({ pending: '' })).toBe(false)
    expect(pending({ pending: id, value: 1 })).toBe(false)
    expect(params({ callId: id })).toBe(true)
    expect(params({})).toBe(false)
    expect(query({})).toBe(true)
    expect(query({ wait: CONNECT_CALL_COLLECT_WAIT_SEC })).toBe(true)
    expect(query({ wait: null })).toBe(true)
    expect(query({ wait: CONNECT_CALL_COLLECT_WAIT_SEC + 1 })).toBe(false)
    expect(result({ state: 'pending' })).toBe(true)
    // Any JSON as the value — an object, an array, a scalar, null.
    for (const value of [{ project: { id: 'p1' } }, ['a'], 'text', 3, null]) {
      expect(result({ state: 'settled', outcome: 'ok', value })).toBe(true)
    }
    expect(result({ state: 'settled', error: 'ViableConnectResilientError|||viable-connect:x|||' })).toBe(true)
    expect(result({ state: 'lost' })).toBe(true)
    expect(result({ state: 'done' })).toBe(false)
    expect(result({ state: 'settled', extra: true })).toBe(false)
  })

  test('the account base is a root of its own, under the account gate, never a child of the project base', () => {
    const gated = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      accountGate: { alias: 'test-gate', params: ['account'] },
    })

    expect(gated.account.base.alias).toBe(connect.account.base)
    expect(gated.account.base.route.route.path).toBe('/connect/account')
    expect(gated.account.base.route.route.parent).toBeUndefined()
    expect(gated.account.base.route.route.method).toBeUndefined()
    expect(gated.account.base.gate).toEqual({ alias: 'test-gate', params: ['account'] })
    expect(gated.account.base.guards).toEqual([DEFAULT_GUARD])
    expect(gated.base.gate).toEqual({ alias: 'test-gate', params: ['owner'] })
    // Without an account gate the base still carries the guard.
    expect(tree.account.base.gate).toBeUndefined()
    expect(tree.account.base.guards).toEqual([DEFAULT_GUARD])
  })

  test('the paid map injects each gate by kind, and the deprecated local-LLM option still reads', () => {
    const paid = Object.fromEntries(Object.values(ConnectPaidGate)
      .map(kind => [kind, { alias: `gate-${kind}`, params: [`param:${kind}`] }]))
    const mapped = connectProtocols({ guard: DEFAULT_GUARD, paid })

    expect(Object.values(ConnectPaidGate)).toEqual([
      'local-llm', 'whitelabel', 'custom-domain', 'production-standalone', 'published-sites',
    ])
    expect(mapped.session.openDelegated.gate).toEqual({ alias: 'gate-local-llm', params: ['param:local-llm'] })
    // Only the routes that spend something carry a payment gate.
    expect(protocols(mapped).filter(protocol => protocol.gate?.alias.startsWith('gate-')).map(protocol => protocol.alias))
      .toEqual([
        connect.account.llm.set, connect.session.openDelegated, connect.project.llm.set, connect.project.branding.credit,
        connect.production.publish, connect.production.domain.attach, connect.production.auth.get,
        connect.production.auth.redirects,
      ])
    expect([mapped.account.llm.set.gate, mapped.project.llm.set.gate]).toEqual([
      { alias: 'gate-local-llm', params: ['param:local-llm'] }, { alias: 'gate-local-llm', params: ['param:local-llm'] },
    ])
    expect(mapped.project.branding.credit.gate).toEqual({ alias: 'gate-whitelabel', params: ['param:whitelabel'] })
    expect([
      mapped.production.publish.gate, mapped.production.domain.attach.gate, mapped.production.auth.get.gate,
      mapped.production.auth.redirects.gate,
    ]).toEqual([
      { alias: 'gate-published-sites', params: ['param:published-sites'] },
      { alias: 'gate-custom-domain', params: ['param:custom-domain'] },
      { alias: 'gate-production-standalone', params: ['param:production-standalone'] },
      { alias: 'gate-production-standalone', params: ['param:production-standalone'] },
    ])
    // A deployment that names no white-label gate leaves the credit switch under ownership alone.
    expect(connectProtocols({ guard: DEFAULT_GUARD }).project.branding.credit.gate).toBeUndefined()

    const legacy = connectProtocols({ guard: DEFAULT_GUARD, localLlm: { alias: 'legacy', params: ['cap'] } })
    expect(legacy.session.openDelegated.gate).toEqual({ alias: 'legacy', params: ['cap'] })
    // The map wins over the deprecated option.
    const both = connectProtocols({
      guard: DEFAULT_GUARD, localLlm: { alias: 'legacy', params: ['cap'] },
      paid: { [ConnectPaidGate.LocalLlm]: { alias: 'mapped', params: ['cap'] } },
    })
    expect(both.session.openDelegated.gate?.alias).toBe('mapped')
    expect(connectProtocols({ guard: DEFAULT_GUARD }).session.openDelegated.gate).toBeUndefined()
  })

  test('deletes and unlocks a project under the owned base, no payment gate', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      localLlm: { alias: 'test-paid-llm', params: ['cap'] },
    })
    const { destroy, unlock } = paid.project

    expect([destroy.route.route.path, unlock.route.route.path]).toEqual(['/project/:id', '/project/:id/unlock'])
    expect([destroy.route.route.method, unlock.route.route.method]).toEqual([RouteMethod.DELETE, RouteMethod.POST])
    expect([aliasOf(destroy.route.route.parent), aliasOf(unlock.route.route.parent)]).toEqual([connect.base, connect.base])
    expect([destroy.gate, unlock.gate]).toEqual([undefined, undefined])
    expect([connectRef.project.destroy.alias, connectRef.project.unlock.alias])
      .toEqual([connect.project.destroy, connect.project.unlock])
  })

  test('a proceed carries the person\'s edits as an optional closed patch', () => {
    const validate = new Ajv({ strict: false }).compile(ConnectConvertProceedBodySchema)

    expect(validate({ decision: 'extract' })).toBe(true)
    expect(validate({ decision: 'extract', update: { name: 'Shop', specification: '# Spec' } })).toBe(true)
    expect(validate({ decision: 'extract', update: {} })).toBe(true)
    expect(validate({ decision: 'extract', update: null })).toBe(true)
    expect(validate({ decision: 'extract', update: { name: '' } })).toBe(false)
    // The alias is not part of the patch: the preview host and the slot were composed from it.
    expect(validate({ decision: 'extract', update: { alias: 'other' } })).toBe(false)
    expect(validate({ decision: 'extract', update: { title: 'Shop' } })).toBe(false)
  })

  test('reads, writes and deletes one file at one path, lists metadata, and controls the preview — owned base, no paid gate', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      paid: Object.fromEntries(Object.values(ConnectPaidGate).map(kind => [kind, { alias: `gate-${kind}`, params: [kind] }])),
    })
    const { get, save, remove, meta } = paid.files
    const { run, restart, stop, rebuild } = paid.sandbox
    const leaves = [get, save, remove, meta, run, restart, stop, rebuild, paid.slot.list]

    expect([get, save, remove].map(protocol => protocol.route.route.path))
      .toEqual(['/project/:id/files/content', '/project/:id/files/content', '/project/:id/files/content'])
    expect([get, save, remove, meta].map(protocol => protocol.route.route.method))
      .toEqual([RouteMethod.GET, RouteMethod.POST, RouteMethod.DELETE, RouteMethod.GET])
    expect(meta.route.route.path).toBe('/project/:id/files/meta')
    expect([run, restart, stop, rebuild].map(protocol => protocol.route.route.path)).toEqual([
      '/project/:id/sandbox/run', '/project/:id/sandbox/restart', '/project/:id/sandbox/stop', '/project/:id/sandbox/rebuild',
    ])
    expect(paid.slot.list.route.route.path).toBe('/slot')
    expect(paid.slot.list.route.route.method).toBe(RouteMethod.GET)
    expect(leaves.map(protocol => aliasOf(protocol.route.route.parent))).toEqual(leaves.map(() => connect.base))
    expect(leaves.map(protocol => protocol.gate)).toEqual(leaves.map(() => undefined))
    expect([connectRef.files.save.alias, connectRef.sandbox.rebuild.alias, connectRef.slot.list.alias])
      .toEqual([connect.files.save, connect.sandbox.rebuild, connect.slot.list])
  })

  test('the file query, the write body and the metadata query are closed shapes', () => {
    const ajv = new Ajv({ strict: false })
    const query = ajv.compile(ConnectFileQuerySchema)
    const body = ajv.compile(ConnectFileSaveBodySchema)
    const meta = ajv.compile(ConnectFileMetaQuerySchema)

    expect(query({ path: 'sources/web/src/app.tsx' })).toBe(true)
    expect(query({ path: '' })).toBe(false)
    expect(query({ path: 'x'.repeat(CONNECT_FILE_PATH_MAX + 1) })).toBe(false)
    expect(query({})).toBe(false)
    expect(body({ path: 'README.md', content: '' })).toBe(true)
    expect(body({ path: 'README.md' })).toBe(false)
    expect(body({ path: 'README.md', content: 'x', mode: 'append' })).toBe(false)
    expect(meta({ kind: 'stories' })).toBe(true)
    expect(meta({ kind: 'meta', category: 'ux' })).toBe(true)
    expect(meta({ kind: 'meta', category: null })).toBe(true)
    expect(meta({ kind: 'sources' })).toBe(false)
    expect(meta({ kind: 'all', category: 'design' })).toBe(false)
  })
  test('the inference preference: the person\'s under the account base, the project\'s under the owned base — read free, set paid', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      accountGate: { alias: 'test-gate', params: ['account'] },
      localLlm: { alias: 'test-paid-llm', params: ['cap'] },
    })
    const { account, project } = paid

    expect([account.llm.get, account.llm.set, project.llm.get, project.llm.set]
      .map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`))
      .toEqual(['GET /llm', 'POST /llm', 'GET /project/:id/llm', 'POST /project/:id/llm'])
    expect([account.llm.get, account.llm.set].map(protocol => aliasOf(protocol.route.route.parent)))
      .toEqual([connect.account.base, connect.account.base])
    expect([project.llm.get, project.llm.set].map(protocol => aliasOf(protocol.route.route.parent)))
      .toEqual([connect.base, connect.base])
    expect([account.llm.get.gate, project.llm.get.gate]).toEqual([undefined, undefined])
    expect([account.llm.set.gate?.alias, project.llm.set.gate?.alias]).toEqual(['test-paid-llm', 'test-paid-llm'])
    expect([connectRef.account.llm.set.alias, connectRef.project.llm.set.alias])
      .toEqual([connect.account.llm.set, connect.project.llm.set])

    const ajv = new Ajv({ strict: false })
    const accountBody = ajv.compile(ConnectLlmBodySchema)
    const projectBody = ajv.compile(ConnectProjectLlmBodySchema)
    expect(accountBody({ llmMode: 'local' })).toBe(true)
    expect(accountBody({ llmMode: null })).toBe(false)
    expect(projectBody({ llmMode: 'cloud' })).toBe(true)
    // `null` inherits the person's preference — it is a value, not an omission.
    expect(projectBody({ llmMode: null })).toBe(true)
    expect(projectBody({})).toBe(false)
    expect(projectBody({ llmMode: 'inherit' })).toBe(false)
  })

  test('access tokens are listed and revoked under the account base, never minted, and never under the browser\'s /tokens mount', () => {
    const { list, revoke } = tree.account.tokens

    expect(Object.keys(tree.account.tokens)).toEqual(['list', 'revoke'])
    expect(Object.keys(connect.account.tokens)).toEqual(['list', 'revoke'])
    expect([list, revoke].map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`))
      .toEqual(['GET /access-tokens', 'POST /access-tokens/:id/revoke'])
    expect([list, revoke].map(protocol => aliasOf(protocol.route.route.parent))).toEqual([connect.account.base, connect.account.base])
    const params = new Ajv({ strict: false }).compile(ConnectAccessTokenParamsSchema)
    expect(params({ id: 'token-1' })).toBe(true)
    expect(params({ id: '' })).toBe(false)
    expect(params({ id: 't'.repeat(CONNECT_TOKEN_ID_MAX + 1) })).toBe(false)
    expect(params({ id: 'token-1', name: 'x' })).toBe(false)
  })

  test('marketing consents are read and withdrawn under the account base — a body that cannot grant', () => {
    const { status, withdraw } = tree.account.privacy

    expect(Object.keys(tree.account.privacy)).toEqual(['status', 'withdraw'])
    expect([status, withdraw].map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`))
      .toEqual(['GET /privacy', 'POST /privacy/withdraw'])
    expect([status, withdraw].map(protocol => aliasOf(protocol.route.route.parent))).toEqual([connect.account.base, connect.account.base])
    const body = new Ajv({ strict: false }).compile(ConnectPrivacyWithdrawBodySchema)
    expect(body({ keys: ['marketing.email'] })).toBe(true)
    expect(body({ keys: [] })).toBe(false)
    expect(body({ keys: ['marketing.email', 'marketing.email'] })).toBe(false)
    expect(body({ keys: Array.from({ length: CONNECT_PRIVACY_KEYS_MAX + 1 }, (_, at) => `k${at}`) })).toBe(false)
    expect(body({ keys: ['marketing.email'], granted: true })).toBe(false)
    expect(body({ decisions: [{ key: 'marketing.email', granted: true }] })).toBe(false)
  })

  test('a stashed prompt is collected under the account base with the guest pickup\'s reference shape', () => {
    const { pickup } = tree.account.intent

    expect(`${pickup.route.route.method!.toUpperCase()} ${pickup.route.route.path}`).toBe('POST /intent/pickup')
    expect(aliasOf(pickup.route.route.parent)).toBe(connect.account.base)
    const body = new Ajv({ strict: false }).compile(ConnectIntentPickupBodySchema)
    expect(body({ ref: 'A'.repeat(24) })).toBe(true)
    expect(body({ ref: '0'.repeat(24) })).toBe(false)
    expect(body({ ref: 'A'.repeat(23) })).toBe(false)
    expect(body({ ref: 'A'.repeat(24), prompt: 'x' })).toBe(false)
  })

  test('git and GitHub sit under the owned base, no paid gate, and nothing completes a GitHub authorization', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      paid: Object.fromEntries(Object.values(ConnectPaidGate).map(kind => [kind, { alias: `gate-${kind}`, params: [kind] }])),
    })
    const routes = [...Object.values(paid.git), ...Object.values(paid.github)]

    expect(routes.map(protocol => aliasOf(protocol.route.route.parent))).toEqual(routes.map(() => connect.base))
    expect(routes.map(protocol => protocol.gate)).toEqual(routes.map(() => undefined))
    expect(Object.keys(connect.git)).toEqual(['status', 'log', 'commit', 'discard', 'revert'])
    expect(Object.keys(connect.github))
      .toEqual(['authorize', 'publish', 'push', 'pull', 'disconnect', 'repos', 'branches', 'link'])
    // Authorized here, completed only by the web application GitHub returns to.
    const everyAlias = [...Object.values(connect.git), ...Object.values(connect.github)]
    expect(everyAlias.filter(alias => /complete|callback|token/.test(alias))).toEqual([])
    expect(routes.filter(protocol => /complete|callback/.test(protocol.route.route.path)).map(protocol => protocol.alias)).toEqual([])
    expect([connectRef.git.status.alias, connectRef.github.authorize.alias, connectRef.github.link.alias])
      .toEqual([connect.git.status, connect.github.authorize, connect.github.link])

    const ajv = new Ajv({ strict: false })
    const commit = ajv.compile(ConnectGitCommitBodySchema)
    expect(commit({ message: 'feat: x' })).toBe(true)
    expect(commit({ message: '' })).toBe(false)
    expect(commit({ message: 'x'.repeat(201) })).toBe(false)
    const revert = ajv.compile(ConnectGitRevertBodySchema)
    expect(revert({ hash: 'abc1234' })).toBe(true)
    expect(revert({ hash: 'abc12' })).toBe(false)
    expect(revert({ hash: '--hard' })).toBe(false)
    const publish = ajv.compile(ConnectGithubPublishBodySchema)
    expect(publish({})).toBe(true)
    expect(publish({ repoName: 'shop', private: false })).toBe(true)
    expect(publish({ existing: { owner: 'acme', repo: 'shop' } })).toBe(true)
    expect(publish({ existing: { owner: 'acme' } })).toBe(false)
    // No field a credential could travel in.
    expect(publish({ token: 'ghp_x' })).toBe(false)
    const repos = ajv.compile(ConnectGithubRepoQuerySchema)
    expect(repos({ page: 2, search: 'shop' })).toBe(true)
    expect(repos({ page: 0 })).toBe(false)
    const branches = ajv.compile(ConnectGithubBranchQuerySchema)
    expect(branches({ owner: 'acme', repo: 'shop' })).toBe(true)
    expect(branches({ owner: 'acme' })).toBe(false)
    const link = ajv.compile(ConnectGithubLinkBodySchema)
    expect(link({ owner: 'acme', repo: 'shop', branch: 'main' })).toBe(true)
    expect(link({ owner: 'acme', repo: 'shop', branch: '' })).toBe(false)
  })
  test('the production workload sits under the owned base, each route with exactly its browser twin\'s payment kind', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      paid: Object.fromEntries(Object.values(ConnectPaidGate).map(kind => [kind, { alias: `gate-${kind}`, params: [kind] }])),
    })
    const { production } = paid
    const routes = [
      production.status, production.publish, production.restart, production.stop,
      production.domain.attach, production.domain.verify, production.domain.detach,
      production.auth.get, production.auth.redirects,
    ]

    expect(routes.map(protocol => aliasOf(protocol.route.route.parent))).toEqual(routes.map(() => connect.base))
    expect(routes.map(protocol => protocol.gate?.alias)).toEqual([
      undefined, 'gate-published-sites', undefined, undefined,
      'gate-custom-domain', undefined, undefined,
      'gate-production-standalone', 'gate-production-standalone',
    ])
    expect(routes.map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`)).toEqual([
      'GET /project/:id/production', 'POST /project/:id/production/publish', 'POST /project/:id/production/restart',
      'POST /project/:id/production/stop', 'POST /project/:id/production/domain/attach',
      'POST /project/:id/production/domain/verify', 'POST /project/:id/production/domain/detach',
      'GET /project/:id/production/auth', 'POST /project/:id/production/auth/redirects',
    ])
    // No route reveals the sign-in's secret, and there is no run verb: a stopped site comes back by restart.
    const everyAlias = routes.map(protocol => protocol.alias)
    expect(everyAlias.filter(alias => /secret|reveal|:run$/.test(alias))).toEqual([])
    expect([connectRef.production.publish.alias, connectRef.production.domain.attach.alias, connectRef.production.auth.get.alias])
      .toEqual([connect.production.publish, connect.production.domain.attach, connect.production.auth.get])

    const ajv = new Ajv({ strict: false })
    const domain = ajv.compile(ConnectProductionDomainBodySchema)
    expect(domain({ domain: 'shop.example.com' })).toBe(true)
    expect(domain({ domain: 'localhost' })).toBe(false)
    expect(domain({ domain: 'https://shop.example.com' })).toBe(false)
    expect(domain({ domain: 'shop.example.com', provider: 'x' })).toBe(false)
    const redirects = ajv.compile(ConnectProductionRedirectsBodySchema)
    expect(redirects({ redirects: [] })).toBe(true)
    expect(redirects({ redirects: ['https://self.example.com/dispatcher'] })).toBe(true)
    expect(redirects({ redirects: Array.from({ length: CONNECT_REDIRECTS_MAX + 1 }, (_, i) => `https://h${i}.test`) })).toBe(false)
    expect(redirects({ redirects: ['x'.repeat(2049)] })).toBe(false)
    expect(redirects({})).toBe(false)
  })

  test('the three feeds are GET reads by cursor — the project\'s under the owned base, the notices under the account base, no paid gate', () => {
    const paid = connectProtocols({
      guard: DEFAULT_GUARD,
      gate: { alias: 'test-gate', params: ['owner'] },
      accountGate: { alias: 'test-gate', params: ['account'] },
      paid: Object.fromEntries(Object.values(ConnectPaidGate).map(kind => [kind, { alias: `gate-${kind}`, params: [kind] }])),
    })
    const routes = [paid.project.activity, paid.account.notifications, paid.files.changes]

    expect(routes.map(protocol => protocol.alias))
      .toEqual([connect.project.activity, connect.account.notifications, connect.files.changes])
    expect(routes.map(protocol => `${protocol.route.route.method!.toUpperCase()} ${protocol.route.route.path}`))
      .toEqual(['GET /project/:id/activity', 'GET /notifications', 'GET /project/:id/files/changes'])
    expect(routes.map(protocol => aliasOf(protocol.route.route.parent)))
      .toEqual([connect.base, connect.account.base, connect.base])
    expect(routes.map(protocol => protocol.gate)).toEqual([undefined, undefined, undefined])
    // Cursor polling, never a socket — the connector holds no connection open.
    expect(routes.every(protocol => protocol.route.route.protocol !== RouteProtocols.SOCKET)).toBe(true)
    expect([connectRef.project.activity.alias, connectRef.account.notifications.alias, connectRef.files.changes.alias])
      .toEqual([connect.project.activity, connect.account.notifications, connect.files.changes])
    expect([CONNECT_FEED_WAIT_MAX_SEC, CONNECT_FEED_LIMIT_MAX, CONNECT_FEED_START]).toEqual([20, 200, '0-0'])
    expect(Object.values(ConnectFeedDetail)).toEqual(['progress', 'thinking'])
    expect(Object.values(ConnectFeedKind)).toContain('thinking')
  })

  test('a feed query is a cursor, a bounded limit and a wait of at most twenty seconds', () => {
    const ajv = new Ajv({ strict: false })
    const query = ajv.compile(ConnectFeedQuerySchema)
    const activity = ajv.compile(ConnectActivityQuerySchema)

    expect(query({})).toBe(true)
    expect(query({ after: '1759800000000-0', limit: 10, wait: CONNECT_FEED_WAIT_MAX_SEC })).toBe(true)
    expect(query({ after: CONNECT_FEED_START })).toBe(true)
    expect(query({ after: null, limit: null, wait: null })).toBe(true)
    expect(query({ wait: CONNECT_FEED_WAIT_MAX_SEC + 1 })).toBe(false)
    expect(query({ limit: 0 })).toBe(false)
    expect(query({ limit: CONNECT_FEED_LIMIT_MAX + 1 })).toBe(false)
    expect(query({ after: '$' })).toBe(false)
    expect(query({ after: '+' })).toBe(false)
    expect(query({ after: '1-0', detail: 'thinking' })).toBe(false)
    expect(activity({ detail: 'thinking' })).toBe(true)
    expect(activity({ detail: null })).toBe(true)
    expect(activity({ detail: 'everything' })).toBe(false)
    expect(activity({ after: '1-0', wait: 5, detail: 'progress' })).toBe(true)
  })
})
