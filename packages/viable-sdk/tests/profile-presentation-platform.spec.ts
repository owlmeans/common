import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import {
  ConnectHarness, ConnectLlm, ConnectTarget, WorkloadKind, type ConnectGitState, type ConnectProductionDomain,
  type ConnectProjectBranding, type ConnectProjectConfig, type ConnectSlotView,
} from '@owlmeans/viable-common'
import { catalogue } from '../src/tools/catalogue.js'
import { ToolHostKind } from '../src/tools/consts.js'
import {
  APP_GRANT_ACTIONS, APP_GROUP_ACTIONS, APP_ORGANIZATION_ACTIONS, APP_USER_ACTIONS, DOMAIN_ACTIONS, FILE_READ_CAP,
  PREVIEW_ACTIONS, PRODUCTION_ACTIONS,
} from '../src/tools/consts.local.js'
import { platformPresentation } from '../src/tools/profile/presentation/platform.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'

/**
 * Every result below is the one the TOOL ITSELF produced: the catalogue's `run` is called against a
 * connector answering each platform call with a fixture, so a presenter is checked against the
 * structured result as it really leaves the tool — not against a hand-written copy of it.
 */

const SCOPE_TOOLS = [
  'project_settings', 'update_project_settings', 'set_platform_credit', 'project_configuration',
  'update_project_configuration', 'recollect_configuration', 'organization_branding', 'update_organization_branding',
  'backfill_project_branding', 'list_access_tokens', 'revoke_access_token', 'privacy_choices',
  'withdraw_marketing_consent', 'pickup_intent', 'list_files', 'read_file', 'write_file', 'delete_file',
  'preview_control', 'git_status', 'git_history', 'git_commit', 'git_discard', 'git_revert', 'connect_github',
  'publish_to_github', 'github_sync', 'disconnect_github', 'github_repositories', 'link_github_origin',
  'production_status', 'publish_production', 'production_control', 'custom_domain', 'production_auth',
  'set_production_redirects', 'app_users', 'manage_app_user', 'app_permissions', 'set_app_permission_default',
  'app_grants', 'manage_app_grant', 'app_organizations', 'manage_app_organization', 'app_groups', 'manage_app_group',
]

/** The split bases and every action their variants fix — each one must have a case below. */
const SPLIT_ACTIONS: Record<string, readonly string[]> = {
  custom_domain: DOMAIN_ACTIONS,
  preview_control: PREVIEW_ACTIONS,
  production_control: PRODUCTION_ACTIONS,
  manage_app_user: APP_USER_ACTIONS,
  manage_app_grant: APP_GRANT_ACTIONS,
  manage_app_organization: APP_ORGANIZATION_ACTIONS,
  manage_app_group: APP_GROUP_ACTIONS,
}

/** Never in a presented result. */
const FORBIDDEN = /entityId|createdAt|updatedAt|namespace|secretValue/

const host: ToolHost = {
  kind: ToolHostKind.Stdio,
  target: ConnectTarget.Cloud,
  llm: ConnectLlm.Cloud,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: true,
}

/** A connector whose every member, at any depth, answers the fixture named by its dotted path. */
const fakeApi = (answers: Record<string, unknown>): unknown => {
  const node = (path: string[]): unknown => new Proxy(() => undefined, {
    get: (_target, prop) => typeof prop === 'string' && prop !== 'then' ? node([...path, prop]) : undefined,
    apply: async () => {
      const key = path.join('.')
      if (!(key in answers)) throw new Error(`unexpected platform call ${key}`)

      return answers[key]
    },
  })

  return node([])
}

const depsOf = (answers: Record<string, unknown>): ToolDeps => ({
  host,
  api: fakeApi(answers),
  session: async () => ({ session: { id: 's1' } }),
  currentSession: () => null,
  attached: () => 'p1',
  attach: () => undefined,
  log: () => undefined,
  notify: () => undefined,
}) as unknown as ToolDeps

const toolNamed = (name: string) => {
  const tool = catalogue.find(entry => entry.name === name)
  if (tool == null) throw new Error(`no tool ${name}`)

  return tool
}

// --- fixtures (shapes from the platform's own views; a few deliberately carry what must not leak) ---

const SETTINGS: ConnectProjectBranding = {
  copyright: '© 2026 Acme Ltd', organizationName: 'Acme Ltd', termsUrl: '/terms', privacyUrl: '/privacy',
  googleTag: 'GTM-ABC1234', credit: { hidden: false, requested: true, entitled: false },
}

const CONFIG = {
  scope: WorkloadKind.Ephemeral,
  // A backend `value` never comes from the platform; it is here to prove none would be echoed.
  backend: [{ name: 'STRIPE_SECRET_KEY', set: true, value: 'sk_live_LEAK' }, { name: 'SMTP_PASSWORD', set: false }],
  frontend: [{ name: 'PUBLIC_MAP_KEY', set: true, value: 'pk_map_123' }, { name: 'PUBLIC_SITE', set: false, value: '' }],
} as unknown as ConnectProjectConfig

const TOKENS = {
  items: [
    {
      id: 'tok-1', name: 'laptop', display: 'vib_ab12…', scopes: ['connect'], oauth: false,
      createdAt: '2026-09-01T10:00:00.000Z', lastUsedAt: '2026-10-30T08:00:00.000Z', expiresAt: '2027-09-01T10:00:00.000Z',
    },
    {
      id: 'tok-2', name: 'Claude', display: 'vib_cd34…', scopes: ['mcp'], oauth: true,
      createdAt: '2026-08-01T10:00:00.000Z', revokedAt: '2026-08-02T10:00:00.000Z',
    },
  ],
}

const PRIVACY = {
  pending: true,
  items: [
    { key: 'marketing.email', group: 'marketing', mode: 'opt-in', granted: true, status: 'current', decidedAt: '2026-07-01T00:00:00.000Z' },
    { key: 'data.profiling', group: 'data', mode: 'opt-out', granted: false, status: 'new' },
  ],
}

const STACKED_WARNING = 'Build failed: cannot resolve ./missing\n    at resolve (/var/sandbox/node_modules/rollup/dist/rollup.js:10:3)'
  + '\n    at build (/var/sandbox/node_modules/rollup/dist/rollup.js:20:5)'

const SLOT = {
  id: 'slot-7f3a', kind: 'ephemeral', status: 'ready', slug: 'shop-p1', host: 'shop-p1.preview.owlmeans.app',
  projectId: 'p1', initialized: true, buildWarning: STACKED_WARNING,
  namespace: 'vib-slot-ns', workload: 'slot-7f3a-deploy',
} as unknown as ConnectSlotView

const COMMIT = {
  hash: 'abcdef1234567890', shortHash: 'abcdef1', subject: 'feat: shop', authorName: 'Octo', authorEmail: 'octo@example.com',
  committedAt: '2026-10-02T09:30:00.000Z',
}

const CONNECTION = {
  projectId: 'p1', githubLogin: 'octo', repoFullName: 'octo/shop', repoUrl: 'https://github.com/octo/shop',
  status: 'published', connectedAt: '2026-10-01T00:00:00.000Z',
}

const STATE: ConnectGitState = {
  connection: CONNECTION,
  git: {
    initialized: true, branch: 'main', dirty: true, changedFiles: 3, remoteUrl: 'https://github.com/octo/shop.git',
    ahead: 1, behind: 0, head: COMMIT,
    files: [{ path: 'src/a.ts', status: 'M' }, { path: 'src/b.ts', status: '??' }],
  },
}

const PENDING_DOMAIN: ConnectProductionDomain = {
  generatedHost: 'shop-acme.owlmeans.app', customDomain: 'shop.example.com', status: 'pending_validation',
  cnameTarget: 'cname.owlmeans.link', dcvName: '_acme-challenge.shop.example.com',
  dcvValue: 'shop.example.com.dcv.owlmeans.link', hostnameStatus: 'pending', sslStatus: 'pending_validation',
}

const LINKED_DOMAIN: ConnectProductionDomain = {
  ...PENDING_DOMAIN, status: 'linked', verifiedAt: '2026-10-20T12:00:00.000Z', hostnameStatus: 'active', sslStatus: 'active',
}

const PRODUCTION_WORKLOAD = {
  id: 'prod-1', kind: 'production', status: 'live', slug: 'shop', namespace: 'vib-prod-ns',
}

const USER = {
  profileId: 'shop:abc', email: 'ann@example.com', name: 'Ann', role: 'user', grantCount: 2, home: 'acme',
  memberships: [{ entitySlug: 'acme', title: 'Acme', owner: true, groups: ['editors'], home: true }],
  entityId: 'ent-0001',
}

const MEMBER = { profileId: 'shop:abc', email: 'ann@example.com', owner: false, groups: ['editors'], entityId: 'ent-0001' }

const GROUP = {
  entitySlug: 'acme', key: 'editors', title: 'Editors', members: 2, entityId: 'ent-0001',
  bundles: [{ permissions: ['post--edit'] }, { filter: { areas: ['operator', null], managed: false } }],
}

const GRANT = {
  profileId: 'shop:abc', clientId: 'client-record-9', permission: 'post--edit', mode: 'blanket', origin: 'direct',
  entitySlug: 'acme',
}

interface Case {
  tool: string
  args: Record<string, unknown>
  answers: Record<string, unknown>
  /** What else the presented value must (not) say — beyond validating against the schema. */
  check?: (presented: Record<string, unknown>, json: string) => void
  /** A result the tool marks as an error but still structures (a refused sync). */
  isError?: boolean
}

const CASES: Case[] = [
  // settings, configuration, branding
  {
    tool: 'project_settings', args: {}, answers: { projectBranding: SETTINGS },
    check: presented => expect(presented).toEqual({ projectId: 'p1', settings: SETTINGS }),
  },
  {
    tool: 'project_settings', args: { scope: 'production' },
    answers: { projectBranding: { ...SETTINGS, credit: undefined } },
    check: presented => expect(presented.scope).toBe('production'),
  },
  { tool: 'update_project_settings', args: { copyright: '© 2027 Acme' }, answers: { saveProjectBranding: SETTINGS } },
  {
    tool: 'update_project_settings', args: { useOrganizationDefaults: true, scope: 'production' },
    answers: { copyOrganizationBranding: SETTINGS },
  },
  { tool: 'set_platform_credit', args: { hidden: true }, answers: { setPlatformCredit: SETTINGS } },
  {
    tool: 'project_configuration', args: {}, answers: { 'config.get': CONFIG },
    check: (presented, json) => {
      expect(json).not.toContain('sk_live_LEAK')
      expect((presented.configuration as { backend: unknown[] }).backend)
        .toEqual([{ name: 'STRIPE_SECRET_KEY', set: true }, { name: 'SMTP_PASSWORD', set: false }])
      // A frontend value is public — it is built into the pages — and stays.
      expect(json).toContain('pk_map_123')
    },
  },
  {
    tool: 'update_project_configuration', args: { backend: { STRIPE_SECRET_KEY: 'sk_live_NEW' } },
    answers: { 'config.save': CONFIG },
    check: (_presented, json) => expect(json).not.toContain('sk_live_'),
  },
  { tool: 'recollect_configuration', args: {}, answers: { 'config.recollect': { ...CONFIG, scope: WorkloadKind.Production } } },
  {
    tool: 'organization_branding', args: {},
    answers: { 'account.branding.get': { organizationName: 'Acme Ltd', copyright: '© Acme' } },
  },
  {
    tool: 'update_organization_branding', args: { copyright: '© Acme 2027' },
    answers: { 'account.branding.save': { organizationName: 'Acme Ltd', copyright: '© Acme 2027' } },
  },
  { tool: 'backfill_project_branding', args: {}, answers: { 'account.branding.backfill': { projects: 3 } } },
  { tool: 'backfill_project_branding', args: {}, answers: { 'account.branding.backfill': { projects: 0 } } },

  // the account
  {
    tool: 'list_access_tokens', args: {}, answers: { 'account.tokens.list': TOKENS },
    check: presented => expect((presented.tokens as unknown[])[0]).toEqual({
      id: 'tok-1', name: 'laptop', display: 'vib_ab12…', scopes: ['connect'], oauth: false, revoked: false,
      created: '2026-09-01', lastUsed: '2026-10-30', expires: '2027-09-01',
    }),
  },
  { tool: 'list_access_tokens', args: {}, answers: { 'account.tokens.list': { items: [] } } },
  {
    tool: 'revoke_access_token', args: { tokenId: 'tok-1', confirm: true }, answers: { 'account.tokens.revoke': { id: 'tok-1' } },
    check: presented => expect(presented).toEqual({ tokenId: 'tok-1' }),
  },
  { tool: 'privacy_choices', args: {}, answers: { 'account.privacy.status': PRIVACY } },
  {
    tool: 'withdraw_marketing_consent', args: { keys: ['marketing.email'] },
    answers: { 'account.privacy.withdraw': { pending: false, items: [] } },
  },
  {
    tool: 'withdraw_marketing_consent', args: { all: true },
    answers: { 'account.privacy.status': { pending: false, items: [{ ...PRIVACY.items[1] }] } },
    check: presented => expect(presented).toEqual({ withdrawn: [] }),
  },
  {
    tool: 'pickup_intent', args: { code: 'ref-1' }, answers: { 'account.intent.pickup': { prompt: 'A bakery shop' } },
    check: presented => expect(presented).toEqual({ prompt: 'A bakery shop' }),
  },

  // files and the preview
  {
    tool: 'list_files', args: {}, answers: { 'files.list': ['sources/web/src/index.tsx', 'sources/api/src/index.ts'] },
    check: presented => expect(presented.kind).toBe('sources'),
  },
  { tool: 'list_files', args: {}, answers: { 'files.list': [] } },
  {
    tool: 'list_files', args: { kind: 'meta', category: 'ba' }, answers: { 'files.meta': ['sources/web/src/home.ba.md'] },
    check: presented => expect([presented.kind, presented.category]).toEqual(['meta', 'ba']),
  },
  { tool: 'list_files', args: { kind: 'stories' }, answers: { 'files.meta': ['.viable/stories/s1.story.md'] } },
  {
    tool: 'read_file', args: { path: 'sources/web/src/index.tsx' },
    answers: { 'files.get': { path: 'sources/web/src/index.tsx', content: 'export {}' } },
    check: presented => expect(presented).toEqual({ projectId: 'p1', path: 'sources/web/src/index.tsx', length: 9, truncated: false }),
  },
  {
    tool: 'read_file', args: { path: 'docs/big.md' },
    answers: { 'files.get': { path: 'docs/big.md', content: 'x'.repeat(FILE_READ_CAP + 1) } },
    check: presented => expect(presented.truncated).toBe(true),
  },
  {
    tool: 'write_file', args: { path: 'sources/web/src/a.ts', content: 'export const a = 1' },
    answers: { 'files.save': { path: 'sources/web/src/a.ts' } },
    check: presented => expect(presented).toEqual({ projectId: 'p1', path: 'sources/web/src/a.ts', previewRebuilt: true }),
  },
  {
    tool: 'write_file', args: { path: 'sources/web/src/a.ts', content: 'broken' },
    answers: { 'files.save': { path: 'sources/web/src/a.ts', buildWarning: STACKED_WARNING } },
    check: presented => {
      expect(presented.previewRebuilt).toBe(false)
      expect(presented.buildWarning).toBe('Build failed: cannot resolve ./missing')
    },
  },
  {
    tool: 'delete_file', args: { path: 'sources/web/src/a.ts', confirm: true },
    answers: { 'files.remove': { path: 'sources/web/src/a.ts' } },
  },
  ...PREVIEW_ACTIONS.map((action): Case => ({
    tool: 'preview_control', args: { action },
    answers: { [`sandbox.${action === 'start' ? 'run' : action}`]: SLOT },
    check: (presented, json) => {
      expect(presented.preview).toEqual({
        status: 'ready', url: 'https://shop-p1.preview.owlmeans.app', initialized: true,
        warnings: ['Build failed: cannot resolve ./missing'],
      })
      for (const internal of ['slot-7f3a', 'vib-slot-ns', 'rollup.js', '/var/sandbox']) expect(json).not.toContain(internal)
    },
  })),

  // git and GitHub
  {
    tool: 'git_status', args: {}, answers: { 'git.status': STATE },
    check: (presented, json) => {
      expect((presented.git as { head: unknown }).head).toEqual({
        hash: 'abcdef1234567890', shortHash: 'abcdef1', subject: 'feat: shop', author: 'Octo', date: '2026-10-02',
      })
      expect(presented.connection).toEqual({
        githubLogin: 'octo', status: 'published', repoFullName: 'octo/shop', repoUrl: 'https://github.com/octo/shop',
      })
      expect(json).not.toContain('octo@example.com')
    },
  },
  {
    tool: 'git_status', args: {}, answers: { 'git.status': { connection: null, git: null } },
    check: presented => expect(presented).toEqual({ projectId: 'p1', connection: null, git: null }),
  },
  {
    tool: 'git_status', args: {},
    answers: { 'git.status': { connection: CONNECTION, git: { ...STATE.git, initialized: false, head: null, remoteUrl: null, ahead: null, behind: null } } },
  },
  { tool: 'git_history', args: {}, answers: { 'git.log': [COMMIT, { ...COMMIT, hash: '1234567abcdef', shortHash: '1234567' }] } },
  { tool: 'git_history', args: {}, answers: { 'git.log': [] } },
  { tool: 'git_commit', args: { message: 'feat: more' }, answers: { 'git.commit': { commit: COMMIT } } },
  {
    tool: 'git_commit', args: { message: 'nothing' }, answers: { 'git.commit': { commit: null } },
    check: presented => expect(presented.commit).toBeNull(),
  },
  { tool: 'git_discard', args: { confirm: true }, answers: { 'git.discard': { ...STATE.git, dirty: false, changedFiles: 0, files: [] } } },
  {
    tool: 'git_revert', args: { hash: 'ABCDEF1', confirm: true },
    answers: { 'git.revert': { commit: COMMIT, dbWarning: 'column "price" no longer exists' } },
    check: presented => expect([presented.hash, presented.dbWarning]).toEqual(['abcdef1', 'column "price" no longer exists']),
  },
  { tool: 'git_revert', args: { hash: 'abcdef1', confirm: true }, answers: { 'git.revert': { commit: null, dbWarning: null } } },
  {
    tool: 'connect_github', args: {}, answers: { 'github.authorize': { authorizeUrl: 'https://github.com/login/oauth/authorize?x=1' } },
  },
  { tool: 'publish_to_github', args: { repoName: 'shop' }, answers: { 'github.publish': CONNECTION } },
  { tool: 'publish_to_github', args: { owner: 'octo', repo: 'shop' }, answers: { 'github.publish': { ...CONNECTION, repoUrl: undefined } } },
  { tool: 'github_sync', args: { direction: 'push' }, answers: { 'github.push': { status: 'ok', ahead: 0, behind: 0 } } },
  { tool: 'github_sync', args: { direction: 'pull' }, answers: { 'github.pull': { status: 'up-to-date', ahead: null, behind: null } } },
  {
    tool: 'github_sync', args: { direction: 'pull' }, isError: true,
    answers: { 'github.pull': { status: 'conflict', ahead: 1, behind: 2, message: 'CONFLICT (content): Merge conflict in src/a.ts' } },
  },
  {
    tool: 'disconnect_github', args: { confirm: true }, answers: { 'github.disconnect': { connection: null } },
    check: presented => expect(presented).toEqual({ projectId: 'p1', connection: null }),
  },
  {
    tool: 'github_repositories', args: {},
    answers: {
      'github.repos': {
        page: 1, hasMore: true,
        repos: [{
          fullName: 'octo/shop', name: 'shop', owner: 'octo', url: 'https://github.com/octo/shop', private: true,
          defaultBranch: 'main', updatedAt: '2026-10-29T00:00:00.000Z', archived: false, fork: false, sizeKb: 120,
          language: 'TypeScript',
        }],
      },
    },
  },
  {
    tool: 'github_repositories', args: { owner: 'octo', repo: 'shop', page: 2 },
    answers: { 'github.branches': { page: 2, hasMore: false, branches: [{ name: 'main', protected: true }] } },
    check: presented => expect([presented.owner, presented.repo, presented.repos]).toEqual(['octo', 'shop', undefined]),
  },
  { tool: 'link_github_origin', args: { owner: 'octo', repo: 'shop' }, answers: { 'github.link': { connection: CONNECTION } } },
  {
    tool: 'link_github_origin', args: { owner: 'octo', repo: 'shop', branch: 'dev' },
    answers: { 'github.link': { connection: { ...CONNECTION, status: 'connected' } } },
    check: presented => expect(presented.branch).toBe('dev'),
  },

  // production
  {
    tool: 'production_status', args: {}, answers: { 'production.status': { workload: PRODUCTION_WORKLOAD, domain: PENDING_DOMAIN } },
    check: (presented, json) => {
      expect(presented.site).toEqual({ status: 'live', url: 'https://shop-acme.owlmeans.app', warnings: [] })
      expect((presented.domain as { records: unknown[] }).records).toEqual([
        { type: 'CNAME', name: 'shop.example.com', value: 'cname.owlmeans.link', purpose: 'traffic', providerStatus: 'pending' },
        {
          type: 'CNAME', name: '_acme-challenge.shop.example.com', value: 'shop.example.com.dcv.owlmeans.link',
          purpose: 'certificate', providerStatus: 'pending_validation',
        },
      ])
      expect(json).not.toContain('prod-1')
    },
  },
  {
    tool: 'production_status', args: {}, answers: { 'production.status': { workload: null, domain: null } },
    check: presented => expect(presented).toEqual({ projectId: 'p1', site: null, domain: null }),
  },
  {
    tool: 'publish_production', args: { confirm: true },
    answers: { 'production.publish': { workload: { ...PRODUCTION_WORKLOAD, status: 'building', lastError: 'previous: oom' }, domain: LINKED_DOMAIN } },
    check: presented => expect((presented.site as { url: string }).url).toBe('https://shop.example.com'),
  },
  ...PRODUCTION_ACTIONS.map((action): Case => ({
    tool: 'production_control', args: { action },
    answers: { [`production.${action}`]: { workload: { ...PRODUCTION_WORKLOAD, status: action === 'stop' ? 'stopped' : 'deploying' }, domain: null } },
  })),
  {
    tool: 'custom_domain', args: { action: 'attach', domain: 'shop.example.com' },
    answers: { 'production.domain.attach': PENDING_DOMAIN },
  },
  {
    tool: 'custom_domain', args: { action: 'verify' }, answers: { 'production.domain.verify': LINKED_DOMAIN },
    check: presented => expect(presented.domain).toEqual({
      generatedHost: 'shop-acme.owlmeans.app', customDomain: 'shop.example.com', status: 'linked', verified: '2026-10-20',
      records: [],
    }),
  },
  {
    tool: 'custom_domain', args: { action: 'verify' },
    answers: { 'production.domain.verify': { ...PENDING_DOMAIN, status: 'error', message: 'CNAME not found' } },
  },
  {
    tool: 'custom_domain', args: { action: 'detach' },
    answers: { 'production.domain.detach': { generatedHost: 'shop-acme.owlmeans.app', status: 'none' } },
  },
  { tool: 'custom_domain', args: { action: 'detach' }, answers: { 'production.domain.detach': null } },
  {
    tool: 'production_auth', args: {},
    answers: {
      'production.auth': {
        clientId: 'shop-prod', issuerUrl: 'https://vib.owlmeans.org/oidc', secretSet: true,
        redirectUris: ['https://my.example.com/dispatcher'], generatedHost: 'shop-acme.owlmeans.app',
      },
    },
    check: presented => expect(presented.siteUrl).toBe('https://shop-acme.owlmeans.app'),
  },
  {
    tool: 'production_auth', args: {},
    answers: { 'production.auth': { clientId: '', issuerUrl: '', secretSet: false, redirectUris: [], generatedHost: '' } },
  },
  {
    tool: 'set_production_redirects', args: { redirects: ['https://my.example.com/dispatcher'] },
    answers: { 'production.setRedirects': { redirectUris: ['https://my.example.com/dispatcher'] } },
  },
  { tool: 'set_production_redirects', args: { redirects: [] }, answers: { 'production.setRedirects': { redirectUris: [] } } },

  // the generated application's sign-in
  {
    tool: 'app_users', args: {}, answers: { 'iam.users.list': { items: [USER] } },
    check: presented => expect((presented.users as Array<{ profileId: string }>)[0]?.profileId).toBe('shop:abc'),
  },
  {
    tool: 'app_users', args: { all: true }, answers: { 'iam.organizationUsers': { items: [USER, { profileId: 'x:1', role: 'admin', disabled: true }] } },
    check: presented => expect(presented.projectId).toBeUndefined(),
  },
  { tool: 'app_users', args: { scope: 'production' }, answers: { 'iam.users.list': { items: [], external: true } } },
  { tool: 'manage_app_user', args: { action: 'invite', email: 'ann@example.com' }, answers: { 'iam.users.invite': USER } },
  { tool: 'manage_app_user', args: { action: 'update', profileId: 'shop:abc', disabled: true }, answers: { 'iam.users.update': { ...USER, disabled: true } } },
  {
    tool: 'manage_app_user', args: { action: 'remove', profileId: 'shop:abc', confirm: true }, answers: { 'iam.users.remove': undefined },
    check: presented => expect(presented).toEqual({ projectId: 'p1', profileId: 'shop:abc', removed: true }),
  },
  {
    tool: 'app_permissions', args: {},
    answers: {
      'iam.permissions': {
        tenancy: { operators: true, users: false },
        items: [
          { name: 'post--edit', resource: 'post', action: 'edit', area: 'operator', defaultClass: 'member', entityScoped: true },
          { name: 'viable:staff', resource: 'viable:staff', managed: true },
        ],
      },
    },
  },
  {
    tool: 'set_app_permission_default', args: { permission: 'post--edit', defaultClass: 'owner' },
    answers: { 'iam.setDefault': { name: 'post--edit', resource: 'post', action: 'edit', defaultClass: 'owner' } },
  },
  {
    tool: 'app_grants', args: { profileId: 'shop:abc' },
    answers: {
      'iam.grants.list': {
        items: [GRANT, {
          profileId: 'shop:abc', clientId: 'client-record-9', permission: 'post--delete', origin: 'group',
          through: { entitySlug: 'acme', key: 'editors' }, restricted: true,
        }],
      },
    },
    check: (_presented, json) => expect(json).not.toContain('client-record-9'),
  },
  {
    tool: 'manage_app_grant', args: { action: 'assign', permission: 'post--edit', profileId: 'shop:abc', entitySlug: 'acme' },
    answers: { 'iam.grants.assign': GRANT },
    check: (_presented, json) => expect(json).not.toContain('client-record-9'),
  },
  {
    tool: 'manage_app_grant', args: { action: 'revoke', permission: 'post--edit', group: 'editors', entitySlug: 'acme', mode: 'inherit', scope: 'production' },
    answers: { 'iam.grants.revoke': undefined },
    check: presented => expect(presented.revoked).toEqual({ permission: 'post--edit', group: { entitySlug: 'acme', key: 'editors' }, mode: 'inherit' }),
  },
  {
    tool: 'app_organizations', args: {}, answers: { 'iam.organizations.list': { items: [{ entitySlug: 'acme', title: 'Acme', members: 3 }] } },
  },
  {
    tool: 'app_organizations', args: { entitySlug: 'acme' }, answers: { 'iam.organizations.members': { items: [MEMBER] } },
    check: presented => expect([presented.entitySlug, presented.organizations]).toEqual(['acme', undefined]),
  },
  {
    tool: 'manage_app_organization', args: { action: 'rename', entitySlug: 'acme', title: 'Acme Inc' },
    answers: { 'iam.organizations.update': { entitySlug: 'acme', title: 'Acme Inc', members: 3 } },
    check: presented => expect(presented.entitySlug).toBe('acme'),
  },
  {
    tool: 'manage_app_organization', args: { action: 'add-member', entitySlug: 'acme', email: 'bob@example.com', owner: true },
    answers: { 'iam.organizations.addMember': { ...MEMBER, profileId: 'shop:bob', owner: true } },
  },
  {
    tool: 'manage_app_organization', args: { action: 'update-member', entitySlug: 'acme', profileId: 'shop:abc', groups: ['editors'] },
    answers: { 'iam.organizations.updateMember': MEMBER },
  },
  {
    tool: 'manage_app_organization', args: { action: 'remove-member', entitySlug: 'acme', profileId: 'shop:abc' },
    answers: { 'iam.organizations.removeMember': undefined },
    check: presented => expect(presented).toEqual({ projectId: 'p1', entitySlug: 'acme', profileId: 'shop:abc', removed: true }),
  },
  { tool: 'app_groups', args: { entitySlug: 'acme' }, answers: { 'iam.groups.list': { items: [GROUP] } } },
  {
    tool: 'app_groups', args: { entitySlug: 'acme', group: 'editors' }, answers: { 'iam.groups.members': { items: [MEMBER] } },
    check: presented => expect([presented.group, presented.groups]).toEqual(['editors', undefined]),
  },
  { tool: 'manage_app_group', args: { action: 'create', entitySlug: 'acme', group: 'editors' }, answers: { 'iam.groups.ensure': GROUP } },
  {
    tool: 'manage_app_group', args: { action: 'update', entitySlug: 'acme', group: 'editors', bundles: [{ permissions: ['post--edit'] }] },
    answers: { 'iam.groups.update': GROUP },
  },
  {
    tool: 'manage_app_group', args: { action: 'delete', entitySlug: 'acme', group: 'editors', confirm: true },
    answers: { 'iam.groups.remove': undefined },
    check: presented => expect(presented).toEqual({ projectId: 'p1', entitySlug: 'acme', key: 'editors', deleted: true }),
  },
  {
    tool: 'manage_app_group', args: { action: 'add-members', entitySlug: 'acme', group: 'editors', profileIds: ['shop:abc'] },
    answers: { 'iam.groups.addMembers': undefined },
    check: presented => expect([presented.action, presented.profileIds]).toEqual(['add-members', ['shop:abc']]),
  },
  {
    tool: 'manage_app_group', args: { action: 'remove-members', entitySlug: 'acme', group: 'editors', profileIds: ['shop:abc'] },
    answers: { 'iam.groups.removeMembers': undefined },
  },
]

/** A tool's own structured result for a case — refusing a case whose run did not succeed. */
const structuredOf = async (entry: Case): Promise<object> => {
  const result = await toolNamed(entry.tool).run(entry.args, depsOf(entry.answers))
  expect([entry.tool, result.isError === true]).toEqual([entry.tool, entry.isError === true])
  if (result.structured == null) throw new Error(`${entry.tool} answered no structured result: ${result.text}`)

  return result.structured
}

const presentationOf = (tool: string) => {
  const entry = platformPresentation[tool]
  if (entry?.output == null || entry.present == null) throw new Error(`no presentation for ${tool}`)

  return { schema: z.object(entry.output).strict(), present: entry.present }
}

describe('viable-sdk — the platform tools\' listing presentation', () => {
  test('declares an output and a presenter for every platform-domain tool, and only for catalogue tools', () => {
    expect(Object.keys(platformPresentation).sort()).toEqual([...SCOPE_TOOLS].sort())
    for (const [name, entry] of Object.entries(platformPresentation)) {
      expect([name, catalogue.some(tool => tool.name === name)]).toEqual([name, true])
      expect([name, Object.keys(entry).sort()]).toEqual([name, ['output', 'present']])
      // What tools/list carries, converted as the MCP server converts it: an object, every part inline.
      const json = z.toJSONSchema(z.object(entry.output!), { target: 'draft-7', io: 'output' })
      expect([name, json.type, JSON.stringify(json).includes('$ref')]).toEqual([name, 'object', false])
    }
  })

  test('has a case for every action of every split base — a variant inherits its base\'s presenter', () => {
    for (const [tool, actions] of Object.entries(SPLIT_ACTIONS)) {
      const covered = new Set(CASES.filter(entry => entry.tool === tool).map(entry => entry.args.action))
      expect([tool, actions.filter(action => !covered.has(action))]).toEqual([tool, []])
    }
    expect(SCOPE_TOOLS.filter(tool => !CASES.some(entry => entry.tool === tool))).toEqual([])
  })

  test('presents every success branch as a value its schema accepts, with nothing internal left', async () => {
    for (const entry of CASES) {
      const { schema, present } = presentationOf(entry.tool)
      const presented = present(await structuredOf(entry), entry.args) as Record<string, unknown>
      const parsed = schema.safeParse(presented)
      expect([entry.tool, entry.args, parsed.success ? 'ok' : parsed.error.message]).toEqual([entry.tool, entry.args, 'ok'])
      // Parsing strips nothing: the presenter emits exactly the declared shape, at every depth.
      expect([entry.tool, parsed.data]).toEqual([entry.tool, presented])
      const json = JSON.stringify(presented)
      expect([entry.tool, FORBIDDEN.exec(json)?.[0] ?? null]).toEqual([entry.tool, null])
      entry.check?.(presented, json)
    }
  })

  test('is total: an empty, foreign or malformed result still answers a value the schema accepts', () => {
    const malformed: unknown[] = [
      {}, null, undefined, [], 'text',
      {
        projectId: 7, settings: 'x', configuration: { backend: 'x', frontend: [1, null] }, tokens: [null, { id: 3 }],
        files: [1, 'a'], slot: [], workload: 'x', domain: { records: 1, status: 4 }, users: { items: [null, 2] },
        commits: [null], connection: 5, git: [], group: 9, members: { items: 'x' }, total: Number.NaN, page: Infinity,
      },
    ]
    for (const [tool, entry] of Object.entries(platformPresentation)) {
      const schema = z.object(entry.output!).strict()
      for (const value of malformed) {
        const presented = entry.present!(value as object, value as Record<string, unknown>)
        const parsed = schema.safeParse(presented)
        expect([tool, value, parsed.success ? 'ok' : parsed.error.message]).toEqual([tool, value, 'ok'])
      }
    }
  })
})
