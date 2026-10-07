import { describe, expect, test } from 'bun:test'
import { CommitState, TransitionAction } from '@owlmeans/planning'
import { CONNECT_TOKEN_PREFIX, connect, ConnectFeedDetail, ConnectLlm, VIABLE_STORY_TYPE, WorkloadKind } from '@owlmeans/viable-common'

import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { transportHelper } from '../src/api/transport.js'
import { COMMIT_POLL_SEC, COMMIT_WAIT_MS, TOOL_DEADLINE_MS } from '../src/consts.js'
import { makeSdkContext } from '../src/context/index.js'
import { storyHelper } from '../src/tools/stories.js'
import { captureTransport } from './context.js'

describe('viable-sdk — remote transport recovery', () => {
  test('recognises a reset on the error or its fetch cause', () => {
    const direct = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' })
    const nested = new TypeError('fetch failed', { cause: direct })

    expect(transportHelper.isTransientTransportError(direct)).toBe(true)
    expect(transportHelper.isTransientTransportError(nested)).toBe(true)
    expect(transportHelper.isTransientTransportError(new Error('project was refused'))).toBe(false)
  })

  test('answers a dropped long poll from one immediate durable snapshot', async () => {
    const calls: string[] = []
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    const result = await transportHelper.recoverLongPoll(async () => { calls.push('poll'); throw reset },
      async () => { calls.push('snapshot'); return { status: 'running' } },)

    expect(result).toEqual({ status: 'running' })
    expect(calls).toEqual(['poll', 'snapshot'])
  })

  test('does not retry a platform refusal', async () => {
    let snapshots = 0
    const refusal = new Error('Forbidden')

    await expect(transportHelper.recoverLongPoll(async () => { throw refusal },
      async () => { snapshots++; return 'wrong' },)).rejects.toBe(refusal)
    expect(snapshots).toBe(0)
  })
})

describe('viable-sdk — the remote project settings', () => {
  test('read and save one record over the connector routes, under the tool deadline', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const stored = {
      copyright: '© 2026 Acme', organizationName: 'Acme', termsUrl: '/terms', privacyUrl: '/privacy',
      googleTag: '',
    }
    const calls = captureTransport(context, call =>
      call.body != null ? { ...stored, ...(call.body as object) } : stored)
    const api = makeRemoteConnectorApi(context)

    expect(await api.projectBranding('p1')).toEqual(stored)
    const saved = await api.saveProjectBranding('p1', { googleTag: 'GTM-ABC1234' })

    expect(saved.googleTag).toBe('GTM-ABC1234')
    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.project.branding.get, '/connect/project/:id/branding', TOOL_DEADLINE_MS],
      [connect.project.branding.save, '/connect/project/:id/branding', TOOL_DEADLINE_MS],
    ])
    // The patch crosses as given: a field it did not name is not sent, so it keeps its stored value.
    expect(calls[1]!.body).toEqual({ googleTag: 'GTM-ABC1234' })
  })
})

describe('viable-sdk — the delegated mode\'s remote calls', () => {
  test('a create names its unattached session, and every request keeps the tool deadline', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`, llm: ConnectLlm.Local,
    })
    const calls = captureTransport(context, call => call.alias.endsWith(':execute')
      ? { transition: { id: 't1', card: 'c1', seq: 1, action: TransitionAction.Create, commit: { state: CommitState.Committed } } }
      : { project: { id: 'p1' } })
    const api = makeRemoteConnectorApi(context)

    await api.project.create('a store finder', 'local' as never, 's-unattached')
    await api.project.create('a store finder')
    await api.planning.execute({ action: TransitionAction.Create, card: { kind: 'card', type: VIABLE_STORY_TYPE, parent: 'p1', title: 'x' } } as never)

    // A write that waits on the parent's model call is collected, never held open: no longer deadline.
    expect(calls.map(call => [call.alias, call.timeout])).toEqual([
      [connect.project.create, TOOL_DEADLINE_MS],
      [connect.project.create, TOOL_DEADLINE_MS],
      [expect.stringContaining(':execute'), TOOL_DEADLINE_MS],
    ])
    expect(calls[0]!.body).toEqual({ prompt: 'a store finder', target: 'local', sessionId: 's-unattached' })
    // Absent, the platform performs the pre-card checks itself — and the key is not sent at all.
    expect(calls[1]!.body).toEqual({ prompt: 'a store finder' })
  })
})

describe('viable-sdk — the remote project lifecycle', () => {
  test('delete and unlock address their own project routes, under the tool deadline', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const calls = captureTransport(context, call => call.alias === connect.project.unlock
      ? { locked: false } : { id: 'p1', name: 'Shop', alias: 'shop' })
    const api = makeRemoteConnectorApi(context)

    expect(await api.project.destroy('p1')).toEqual({ id: 'p1', name: 'Shop', alias: 'shop' })
    expect(await api.project.unlock('p1')).toEqual({ locked: false })
    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.project.destroy, '/connect/project/:id', TOOL_DEADLINE_MS],
      [connect.project.unlock, '/connect/project/:id/unlock', TOOL_DEADLINE_MS],
    ])
  })
})

describe('viable-sdk — the remote account records', () => {
  test('inference, tokens, consents and the intent pickup address their own routes, under the tool deadline', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const calls = captureTransport(context, () => ({ ok: true }))
    const api = makeRemoteConnectorApi(context)

    await api.account.llm.get()
    await api.account.llm.set(ConnectLlm.Local)
    await api.project.llm('p1')
    await api.project.setLlm('p1', null)
    await api.account.tokens.list()
    await api.account.tokens.revoke('t1')
    await api.account.privacy.status()
    await api.account.privacy.withdraw(['marketing.email'])
    await api.account.intent.pickup('A'.repeat(24))

    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.account.llm.get, '/connect/account/llm', TOOL_DEADLINE_MS],
      [connect.account.llm.set, '/connect/account/llm', TOOL_DEADLINE_MS],
      [connect.project.llm.get, '/connect/project/:id/llm', TOOL_DEADLINE_MS],
      [connect.project.llm.set, '/connect/project/:id/llm', TOOL_DEADLINE_MS],
      [connect.account.tokens.list, '/connect/account/access-tokens', TOOL_DEADLINE_MS],
      [connect.account.tokens.revoke, '/connect/account/access-tokens/:id/revoke', TOOL_DEADLINE_MS],
      [connect.account.privacy.status, '/connect/account/privacy', TOOL_DEADLINE_MS],
      [connect.account.privacy.withdraw, '/connect/account/privacy/withdraw', TOOL_DEADLINE_MS],
      [connect.account.intent.pickup, '/connect/account/intent/pickup', TOOL_DEADLINE_MS],
    ])
    expect(calls[1]!.body).toEqual({ llmMode: 'local' })
    // `null` crosses as a value: it is what unsets the override.
    expect(calls[3]!.body).toEqual({ llmMode: null })
    expect(calls[7]!.body).toEqual({ keys: ['marketing.email'] })
    expect(calls[8]!.body).toEqual({ ref: 'A'.repeat(24) })
  })
})

describe('viable-sdk — the remote planning kits', () => {
  test('describe and apply over one project path, under the tool deadline', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const calls = captureTransport(context, call =>
      call.body != null ? { applied: ['task'], skipped: [], warnings: [] } : { kits: [] })
    const api = makeRemoteConnectorApi(context)

    expect(await api.project.kitDescribe('p1')).toEqual({ kits: [] })
    expect(await api.project.kitApply('p1', { kit: 'project', types: ['task'] }))
      .toEqual({ applied: ['task'], skipped: [], warnings: [] })
    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.project.kit.describe, '/connect/project/:id/kits', TOOL_DEADLINE_MS],
      [connect.project.kit.apply, '/connect/project/:id/kits', TOOL_DEADLINE_MS],
    ])
    expect(calls[1]!.body).toEqual({ kit: 'project', types: ['task'] })
  })
})

describe('viable-sdk — the remote git and GitHub calls', () => {
  test('each reaches its project route under the tool deadline, carrying only the fields named', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const calls = captureTransport(context, () => ({}))
    const api = makeRemoteConnectorApi(context)

    await api.git.status('p1')
    await api.git.log('p1')
    await api.git.commit('p1', 'feat: x')
    await api.git.discard('p1')
    await api.git.revert('p1', 'abc1234')
    await api.github.authorize('p1')
    await api.github.publish('p1', { existing: { owner: 'acme', repo: 'shop' } })
    await api.github.push('p1')
    await api.github.pull('p1')
    await api.github.disconnect('p1')
    await api.github.repos('p1', { search: 'shop' })
    await api.github.branches('p1', { owner: 'acme', repo: 'shop' })
    await api.github.link('p1', { owner: 'acme', repo: 'shop', branch: 'main' })

    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.git.status, '/connect/project/:id/git', TOOL_DEADLINE_MS],
      [connect.git.log, '/connect/project/:id/git/log', TOOL_DEADLINE_MS],
      [connect.git.commit, '/connect/project/:id/git/commit', TOOL_DEADLINE_MS],
      [connect.git.discard, '/connect/project/:id/git/discard', TOOL_DEADLINE_MS],
      [connect.git.revert, '/connect/project/:id/git/revert', TOOL_DEADLINE_MS],
      [connect.github.authorize, '/connect/project/:id/github/authorize', TOOL_DEADLINE_MS],
      [connect.github.publish, '/connect/project/:id/github/publish', TOOL_DEADLINE_MS],
      [connect.github.push, '/connect/project/:id/github/push', TOOL_DEADLINE_MS],
      [connect.github.pull, '/connect/project/:id/github/pull', TOOL_DEADLINE_MS],
      [connect.github.disconnect, '/connect/project/:id/github/disconnect', TOOL_DEADLINE_MS],
      [connect.github.repos, '/connect/project/:id/github/repos', TOOL_DEADLINE_MS],
      [connect.github.branches, '/connect/project/:id/github/branches', TOOL_DEADLINE_MS],
      [connect.github.link, '/connect/project/:id/github/link', TOOL_DEADLINE_MS],
    ])
    expect(calls[2]!.body).toEqual({ message: 'feat: x' })
    expect(calls[4]!.body).toEqual({ hash: 'abc1234' })
    expect(calls[6]!.body).toEqual({ existing: { owner: 'acme', repo: 'shop' } })
    expect(calls[10]!.query).toEqual({ search: 'shop' })
    expect(calls[11]!.query).toEqual({ owner: 'acme', repo: 'shop' })
    expect(calls[12]!.body).toEqual({ owner: 'acme', repo: 'shop', branch: 'main' })
  })
})

describe('viable-sdk — the remote production calls', () => {
  test('each reaches its project route under the tool deadline, carrying only the fields named', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const calls = captureTransport(context, () => ({}))
    const api = makeRemoteConnectorApi(context)

    await api.production.status('p1')
    await api.production.publish('p1')
    await api.production.restart('p1')
    await api.production.stop('p1')
    await api.production.domain.attach('p1', 'shop.example.com')
    await api.production.domain.verify('p1')
    await api.production.domain.detach('p1')
    await api.production.auth('p1')
    await api.production.setRedirects('p1', ['https://self.example.com/dispatcher'])

    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.production.status, '/connect/project/:id/production', TOOL_DEADLINE_MS],
      [connect.production.publish, '/connect/project/:id/production/publish', TOOL_DEADLINE_MS],
      [connect.production.restart, '/connect/project/:id/production/restart', TOOL_DEADLINE_MS],
      [connect.production.stop, '/connect/project/:id/production/stop', TOOL_DEADLINE_MS],
      [connect.production.domain.attach, '/connect/project/:id/production/domain/attach', TOOL_DEADLINE_MS],
      [connect.production.domain.verify, '/connect/project/:id/production/domain/verify', TOOL_DEADLINE_MS],
      [connect.production.domain.detach, '/connect/project/:id/production/domain/detach', TOOL_DEADLINE_MS],
      [connect.production.auth.get, '/connect/project/:id/production/auth', TOOL_DEADLINE_MS],
      [connect.production.auth.redirects, '/connect/project/:id/production/auth/redirects', TOOL_DEADLINE_MS],
    ])
    expect(calls[4]!.body).toEqual({ domain: 'shop.example.com' })
    expect(calls[8]!.body).toEqual({ redirects: ['https://self.example.com/dispatcher'] })
    expect(calls.map(call => call.query ?? {})).toEqual(calls.map(() => ({})))
  })
})

describe('viable-sdk — the remote calls of the generated app\'s sign-in', () => {
  test('a read carries scope in its query, a write in its body — a removal included; the organization-wide list under the account base', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const calls = captureTransport(context, () => ({ items: [] }))
    const api = makeRemoteConnectorApi(context)

    await api.iam.organizationUsers()
    await api.iam.users.list('p1', WorkloadKind.Production)
    await api.iam.users.remove('p1', 'shop:abc', WorkloadKind.Production)
    await api.iam.grants.assign('p1', { profileId: 'shop:abc', permission: 'order--view' })
    await api.iam.groups.addMembers('p1', 'acme', 'editors', ['shop:abc'])
    await api.iam.organizations.members('p1', 'acme')

    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.account.iam.users, '/connect/account/iam/users', TOOL_DEADLINE_MS],
      [connect.iam.users.list, '/connect/project/:id/iam/users', TOOL_DEADLINE_MS],
      [connect.iam.users.remove, '/connect/project/:id/iam/users/:profileId/remove', TOOL_DEADLINE_MS],
      [connect.iam.grants.assign, '/connect/project/:id/iam/grants', TOOL_DEADLINE_MS],
      [connect.iam.groups.addMembers, '/connect/project/:id/iam/organizations/:entitySlug/groups/:group/members', TOOL_DEADLINE_MS],
      [connect.iam.organizations.members, '/connect/project/:id/iam/organizations/:entitySlug/members', TOOL_DEADLINE_MS],
    ])
    expect(calls[1]!.query).toEqual({ scope: WorkloadKind.Production })
    expect(calls[2]!.body).toEqual({ scope: WorkloadKind.Production })
    expect(calls[4]!.body).toEqual({ profileIds: ['shop:abc'] })
    expect(calls[5]!.query ?? {}).toEqual({})
  })
})

describe('viable-sdk — the remote planning facade', () => {
  test('is the context\'s planning client: one bound route per call, each under the tool deadline', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const card = { id: 'c1', kind: 'card', type: VIABLE_STORY_TYPE, status: 'in-progress', seq: 2 }
    const transition = {
      id: 't1', card: 'c1', seq: 2, action: TransitionAction.Transit, commit: { state: CommitState.Pending },
    }
    const calls = captureTransport(context, call => {
      if (call.alias.endsWith(':card:list')) return { items: [], total: 0 }
      if (call.alias.endsWith(':execute')) return { transition }
      // The first read of a commit does not hold; the next one holds and sees it land.
      return Number(call.query.wait) === 0
        ? { transition: 't1', state: CommitState.Pending }
        : { transition: 't1', state: CommitState.Committed, card }
    })
    const { planning } = makeRemoteConnectorApi(context)

    await planning.cards.list(storyHelper.storyQuery('p1', { area: 'user' }))
    const receipt = await planning.execute({
      card: 'c1', action: TransitionAction.Transit, transition: 'start', actor: { agent: 'forged' },
    }, { wait: true, timeout: COMMIT_WAIT_MS })

    expect(receipt.card).toEqual(card as never)
    expect(calls.map(call => [call.path, call.timeout])).toEqual([
      ['/planning/cards', TOOL_DEADLINE_MS],
      ['/planning/execute', TOOL_DEADLINE_MS],
      ['/planning/commits/:transition', TOOL_DEADLINE_MS],
      // A hold outlasts its own wait by ten seconds, or every quiet poll reads as a dropped line.
      ['/planning/commits/:transition', (COMMIT_POLL_SEC + 10) * 1000],
    ])
    // The query crosses in its wire shape, and the actor never crosses at all.
    expect(calls[0]!.query).toMatchObject({ parent: 'p1', type: VIABLE_STORY_TYPE, fields: '{"area":"user"}' })
    expect(calls[1]!.body).not.toHaveProperty('actor')
  })
})

describe('viable-sdk — the remote API addresses only routes the platform serves', () => {
  test('no capability view, no session read or heartbeat, no conversion cancel; every connector route is bound', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const api = makeRemoteConnectorApi(context)

    expect(Object.keys(api).sort()).toEqual([
      'account', 'closeSession', 'config', 'convert', 'copyOrganizationBranding', 'files', 'git', 'github', 'iam', 'inquiry',
      'openSession',
      'pipeline', 'planning', 'production', 'project', 'projectBranding', 'pullOps', 'sandbox', 'saveProjectBranding',
      'setPlatformCredit', 'slot', 'story', 'submitOp',
    ])
    expect(Object.keys(api.config).sort()).toEqual(['get', 'recollect', 'save'])
    expect(Object.keys(api.account).sort()).toEqual(['branding', 'intent', 'llm', 'notifications', 'privacy', 'tokens'])
    expect(Object.keys(api.account.branding).sort()).toEqual(['backfill', 'get', 'save'])
    expect(Object.keys(api.account.llm).sort()).toEqual(['get', 'set'])
    // Listed and revoked — a token is never minted through the connector.
    expect(Object.keys(api.account.tokens).sort()).toEqual(['list', 'revoke'])
    // Read and withdrawn — a consent is never granted through the connector.
    expect(Object.keys(api.account.privacy).sort()).toEqual(['status', 'withdraw'])
    expect(Object.keys(api.account.intent)).toEqual(['pickup'])
    expect(Object.keys(api.project)).toEqual(expect.arrayContaining(['llm', 'setLlm', 'activity']))
    expect(Object.keys(api.files).sort()).toEqual(['changes', 'get', 'list', 'meta', 'remove', 'save'])
    expect(Object.keys(api.sandbox).sort()).toEqual(['rebuild', 'restart', 'run', 'stop'])
    expect(Object.keys(api.slot)).toEqual(['list'])
    expect(Object.keys(api.convert).sort()).toEqual(['check', 'create', 'proceed', 'purge', 'start', 'status'])
    expect(Object.keys(api.git).sort()).toEqual(['commit', 'discard', 'log', 'revert', 'status'])
    // Authorized, never completed: the completion is the web application's callback.
    expect(Object.keys(api.github).sort())
      .toEqual(['authorize', 'branches', 'disconnect', 'link', 'publish', 'pull', 'push', 'repos'])
    // No reveal of the sign-in's secret, and no run verb: a stopped site comes back by restart.
    expect(Object.keys(api.production).sort()).toEqual(['auth', 'domain', 'publish', 'restart', 'setRedirects', 'status', 'stop'])
    expect(Object.keys(api.production.domain).sort()).toEqual(['attach', 'detach', 'verify'])
    // The generated app's sign-in, per project; the staff synchronization has no connector twin.
    expect(Object.keys(api.iam).sort())
      .toEqual(['grants', 'groups', 'organizationUsers', 'organizations', 'permissions', 'setDefault', 'users'])
    expect(Object.keys(api.iam.users).sort()).toEqual(['invite', 'list', 'remove', 'update'])
    const leaves = (value: object): string[] => Object.values(value)
      .flatMap(entry => typeof entry === 'string' ? [entry] : leaves(entry as object))
    for (const alias of leaves(connect)) {
      expect(() => context.entrypoint(alias)).not.toThrow()
    }
  })
})

describe('viable-sdk — the remote feeds', () => {
  test('three GET reads by cursor: only the named query crosses, and a held read outlasts its wait', async () => {
    const context = await makeSdkContext({
      apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`,
    })
    const page = { cursor: '1759800000000-3', entries: [], gap: false }
    const calls = captureTransport(context, call => call.alias === connect.files.changes ? { ...page, watching: true } : page)
    const api = makeRemoteConnectorApi(context)

    expect(await api.project.activity('p1', { after: '1-0', wait: 20, detail: ConnectFeedDetail.Thinking })).toEqual(page)
    await api.account.notifications()
    expect(await api.files.changes('p1', { after: '1759800000000-2', limit: 5 })).toEqual({ ...page, watching: true })

    expect(calls.map(call => [call.alias, call.path, call.timeout])).toEqual([
      [connect.project.activity, '/connect/project/:id/activity', Math.max(TOOL_DEADLINE_MS, (20 + 10) * 1000)],
      [connect.account.notifications, '/connect/account/notifications', TOOL_DEADLINE_MS],
      [connect.files.changes, '/connect/project/:id/files/changes', TOOL_DEADLINE_MS],
    ])
    expect(calls.map(call => call.query)).toEqual([
      { after: '1-0', wait: 20, detail: 'thinking' }, {}, { after: '1759800000000-2', limit: 5 },
    ])
  })
})
