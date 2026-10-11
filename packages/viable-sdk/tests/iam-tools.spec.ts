import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectLlm, ConnectTarget, WorkloadKind } from '@owlmeans/viable-common'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'

const IAM_TOOLS = [
  'app_users', 'manage_app_user', 'app_permissions', 'set_app_permission_default', 'app_grants',
  'manage_app_grant', 'app_organizations', 'manage_app_organization', 'app_groups', 'manage_app_group',
]

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

const USER = { profileId: 'shop:abc', email: 'ann@example.com', name: 'Ann', role: 'user' }
const GROUP = { entitySlug: 'acme', key: 'editors', bundles: [] }
const MEMBER = { profileId: 'shop:abc', owner: false, groups: [] }

/** A connector whose IAM calls are recorded in order; every answer is the one given, an Error thrown. */
const connector = (answers: Record<string, unknown> = {}, attached: string | null = 'p1') => {
  const calls: unknown[][] = []
  const member = (name: string, fallback: unknown = undefined) => async (...args: unknown[]) => {
    calls.push([name, ...args])
    const answer = answers[name]
    if (answer instanceof Error) throw answer

    return answer === undefined ? fallback : answer
  }
  const deps = {
    host: host(),
    api: {
      iam: {
        organizationUsers: member('organizationUsers', { items: [USER] }),
        permissions: member('permissions', { items: [], tenancy: { operators: false, users: false } }),
        setDefault: member('setDefault', { name: 'order--view', resource: 'order', defaultClass: 'owner' }),
        grants: {
          list: member('grants.list', { items: [] }),
          assign: member('grants.assign', { clientId: 'shop', permission: 'order--view', profileId: 'shop:abc' }),
          revoke: member('grants.revoke'),
        },
        users: {
          list: member('users.list', { items: [USER] }),
          invite: member('users.invite', USER),
          update: member('users.update', USER),
          remove: member('users.remove'),
        },
        organizations: {
          list: member('organizations.list', { items: [{ entitySlug: 'acme', members: 2 }] }),
          update: member('organizations.update', { entitySlug: 'acme', title: 'Acme' }),
          members: member('organizations.members', { items: [MEMBER] }),
          addMember: member('organizations.addMember', MEMBER),
          updateMember: member('organizations.updateMember', MEMBER),
          removeMember: member('organizations.removeMember'),
        },
        groups: {
          list: member('groups.list', { items: [GROUP] }),
          ensure: member('groups.ensure', GROUP),
          update: member('groups.update', GROUP),
          remove: member('groups.remove'),
          members: member('groups.members', { items: [MEMBER] }),
          addMembers: member('groups.addMembers'),
          removeMembers: member('groups.removeMembers'),
        },
      },
    },
    session: async () => ({}) as never,
    currentSession: () => null,
    attached: () => attached,
    attach: () => undefined,
    log: () => undefined,
  } as unknown as ToolDeps

  return { deps, calls }
}

const run = async (name: string, args: Record<string, unknown>, answers: Record<string, unknown> = {}) => {
  const { deps, calls } = connector(answers)
  const result = await toolNamed(name).run(args, deps)

  return { result, calls }
}

describe('viable-sdk — the generated app\'s sign-in tools', () => {
  test('are offered on every host and target — the sign-in is the platform\'s, a local project\'s too', () => {
    for (const patch of [{}, { kind: ToolHostKind.Http, hasExecutor: false }, { target: ConnectTarget.Local }]) {
      const offered = catalogueHelper.visibleTools(host(patch)).map(tool => tool.name)
      expect(IAM_TOOLS.filter(tool => !offered.includes(tool))).toEqual([])
    }
    expect(PLATFORM_CATALOGUE.capabilities.find(group => group.id === 'app-sign-in')?.tools).toEqual(IAM_TOOLS)
  })

  test('reads are read-only; every tool that can remove, revoke or delete says it is destructive', () => {
    for (const name of IAM_TOOLS) {
      const expected = name.startsWith('app_') ? { readOnlyHint: true, destructiveHint: false }
        : name === 'set_app_permission_default' ? { readOnlyHint: false, destructiveHint: false }
          : { readOnlyHint: false, destructiveHint: true }
      expect([name, toolNamed(name).annotations.readOnlyHint, toolNamed(name).annotations.destructiveHint])
        .toEqual([name, expected.readOnlyHint, expected.destructiveHint])
    }
  })
})

describe('viable-sdk — an action\'s required fields are checked before any call', () => {
  const REFUSED: Array<[string, Record<string, unknown>, RegExp]> = [
    ['manage_app_user', { action: 'invite' }, /email/],
    ['manage_app_user', { action: 'update' }, /profileId/],
    ['manage_app_user', { action: 'update', profileId: 'shop:abc' }, /name, role or disabled/],
    ['manage_app_user', { action: 'remove' }, /profileId/],
    ['manage_app_user', { action: 'remove', profileId: 'shop:abc' }, /confirm: true/],
    ['manage_app_user', { action: 'remove', profileId: 'shop:abc', confirm: false }, /confirm: true/],
    ['manage_app_user', { action: 'erase', profileId: 'shop:abc' }, /invite, update or remove/],
    ['set_app_permission_default', { permission: 'order--view' }, /defaultClass or entityScoped/],
    ['app_grants', { profileId: 'shop:abc', group: 'editors', entitySlug: 'acme' }, /not both/],
    ['app_grants', { group: 'editors' }, /entitySlug/],
    ['manage_app_grant', { action: 'assign', permission: 'order--view' }, /a person \(profileId\) or a group/],
    ['manage_app_grant', { action: 'assign', permission: 'order--view', profileId: 'shop:abc', group: 'editors', entitySlug: 'acme' }, /not both/],
    ['manage_app_grant', { action: 'revoke', permission: 'order--view', group: 'editors' }, /entitySlug/],
    ['manage_app_grant', { action: 'assign', profileId: 'shop:abc' }, /permission/],
    ['manage_app_grant', { action: 'give', permission: 'order--view', profileId: 'shop:abc' }, /assign or revoke/],
    ['manage_app_organization', { action: 'rename', entitySlug: 'acme' }, /title/],
    ['manage_app_organization', { action: 'rename', title: 'Acme' }, /entitySlug/],
    ['manage_app_organization', { action: 'add-member', entitySlug: 'acme' }, /email/],
    ['manage_app_organization', { action: 'update-member', entitySlug: 'acme', profileId: 'shop:abc' }, /owner or groups/],
    ['manage_app_organization', { action: 'remove-member', entitySlug: 'acme' }, /profileId/],
    ['manage_app_group', { action: 'create', entitySlug: 'acme' }, /key/],
    ['manage_app_group', { action: 'update', entitySlug: 'acme', group: 'editors' }, /title, or bundles/],
    ['manage_app_group', { action: 'delete', entitySlug: 'acme', group: 'editors' }, /confirm: true/],
    ['manage_app_group', { action: 'add-members', entitySlug: 'acme', group: 'editors', profileIds: [] }, /profileIds/],
    ['manage_app_group', { action: 'remove-members', group: 'editors', profileIds: ['shop:abc'] }, /entitySlug/],
    ['app_groups', {}, /entitySlug/],
  ]

  for (const [name, args, reason] of REFUSED) {
    test(`${name} ${JSON.stringify(args)} is refused, nothing called`, async () => {
      const { result, calls } = await run(name, args)

      expect(result.isError).toBe(true)
      expect(result.text).toMatch(reason)
      expect(calls).toEqual([])
    })
  }
})

describe('viable-sdk — the sign-in tools call exactly what they were asked', () => {
  test('a user is invited, updated and removed — the removal with its scope, once agreed', async () => {
    const invited = await run('manage_app_user', { action: 'invite', email: ' ann@example.com ', name: 'Ann', scope: WorkloadKind.Production })
    expect(invited.calls).toEqual([['users.invite', 'p1', { email: 'ann@example.com', name: 'Ann', scope: WorkloadKind.Production }]])
    expect(invited.result.text).toContain('Invited: Ann <ann@example.com>')

    const updated = await run('manage_app_user', { action: 'update', profileId: 'shop:abc', disabled: true })
    expect(updated.calls).toEqual([['users.update', 'p1', 'shop:abc', { disabled: true }]])

    const removed = await run('manage_app_user', { action: 'remove', profileId: 'shop:abc', confirm: true, scope: WorkloadKind.Production })
    expect(removed.calls).toEqual([['users.remove', 'p1', 'shop:abc', WorkloadKind.Production]])
    expect(removed.result.isError).toBeUndefined()
  })

  test('a grant names one subject: a person bound to an organization, or a group of its own organization', async () => {
    const person = await run('manage_app_grant', {
      action: 'assign', permission: 'order--view', profileId: 'shop:abc', entitySlug: 'acme', resources: ['o1'], mode: 'resources',
    })
    expect(person.calls).toEqual([['grants.assign', 'p1', {
      permission: 'order--view', profileId: 'shop:abc', entitySlug: 'acme', resources: ['o1'], mode: 'resources',
    }]])

    const group = await run('manage_app_grant', { action: 'revoke', permission: 'order--view', group: 'editors', entitySlug: 'acme' })
    expect(group.calls).toEqual([['grants.revoke', 'p1', { permission: 'order--view', group: { entitySlug: 'acme', key: 'editors' } }]])
  })

  test('the listings: every application\'s users, one organization\'s members, one group\'s members', async () => {
    const all = await run('app_users', { all: true })
    expect(all.calls).toEqual([['organizationUsers']])
    expect(all.result.text).toContain('End users of every application of this organization (1)')

    const members = await run('app_organizations', { entitySlug: 'acme' })
    expect(members.calls).toEqual([['organizations.members', 'p1', 'acme', undefined]])

    const groupMembers = await run('app_groups', { entitySlug: 'acme', group: 'editors', scope: WorkloadKind.Production })
    expect(groupMembers.calls).toEqual([['groups.members', 'p1', 'acme', 'editors', WorkloadKind.Production]])
  })

  test('an external listing says the sign-in is managed elsewhere instead of reporting nobody', async () => {
    const { result } = await run('app_users', {}, { 'users.list': { items: [], external: true } })

    expect(result.text).toContain('console of its own')
    expect(result.text).not.toContain('nobody')
  })

  test('a group is deleted only once agreed, and members move by profileIds', async () => {
    const deleted = await run('manage_app_group', { action: 'delete', entitySlug: 'acme', group: 'editors', confirm: true })
    expect(deleted.calls).toEqual([['groups.remove', 'p1', 'acme', 'editors', undefined]])

    const added = await run('manage_app_group', { action: 'add-members', entitySlug: 'acme', group: 'editors', profileIds: ['shop:abc'] })
    expect(added.calls).toEqual([['groups.addMembers', 'p1', 'acme', 'editors', ['shop:abc'], undefined]])
  })

  test('an IAM refusal is answered as the sentence the person can act on', async () => {
    const { result } = await run('manage_app_group', {
      action: 'update', entitySlug: 'acme', group: 'members', title: 'Staff',
    }, { 'groups.update': new Error('iam-refused:iam:group:managed:members') })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('refused this change on its own terms')
  })
})
