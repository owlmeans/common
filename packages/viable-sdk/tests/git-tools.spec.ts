import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectLlm, ConnectTarget, type ConnectGitState } from '@owlmeans/viable-common'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import { refusalHelper } from '../src/tools/refusal.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'

const GIT_TOOLS = [
  'git_status', 'git_history', 'git_commit', 'git_discard', 'git_revert', 'connect_github',
  'publish_to_github', 'github_sync', 'disconnect_github', 'github_repositories', 'link_github_origin',
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

/** A connector whose git and GitHub calls are recorded in order; every answer is the one given. */
const connector = (answers: Record<string, unknown> = {}, attached: string | null = 'p1') => {
  const calls: unknown[][] = []
  const member = (area: string, name: string) => async (...args: unknown[]) => {
    calls.push([`${area}.${name}`, ...args])
    const answer = answers[`${area}.${name}`]
    if (answer instanceof Error) throw answer

    return answer ?? {}
  }
  const area = (name: string, members: string[]) =>
    Object.fromEntries(members.map(member_ => [member_, member(name, member_)]))
  const deps = {
    host: host(),
    api: {
      git: area('git', ['status', 'log', 'commit', 'discard', 'revert']),
      github: area('github', ['authorize', 'publish', 'push', 'pull', 'disconnect', 'repos', 'branches', 'link']),
    },
    session: async () => ({}) as never,
    currentSession: () => null,
    attached: () => attached,
    attach: () => undefined,
    log: () => undefined,
  } as unknown as ToolDeps

  return { deps, calls }
}

const STATE: ConnectGitState = {
  connection: {
    projectId: 'p1', githubLogin: 'octo', repoFullName: 'octo/shop', repoUrl: 'https://github.com/octo/shop',
    status: 'published', connectedAt: '2026-10-01T00:00:00.000Z',
  },
  git: {
    initialized: true, branch: 'main', dirty: true, changedFiles: 2, remoteUrl: 'https://github.com/octo/shop.git',
    ahead: 1, behind: 0,
    head: {
      hash: 'abcdef1234567', shortHash: 'abcdef1', subject: 'feat: shop', authorName: 'Octo', authorEmail: 'o@x',
      committedAt: '2026-10-02T00:00:00.000Z',
    },
    files: [{ path: 'src/a.ts', status: 'M' }, { path: 'src/b.ts', status: '??' }],
  },
}

describe('viable-sdk — the git and GitHub tools', () => {
  test('are offered only where the platform holds the tree — a cloud target, on either host', () => {
    for (const kind of [ToolHostKind.Stdio, ToolHostKind.Http]) {
      const offered = catalogueHelper.visibleTools(host({ kind, hasExecutor: kind === ToolHostKind.Stdio }))
        .map(tool => tool.name)
      for (const tool of GIT_TOOLS) expect([kind, tool, offered.includes(tool)]).toEqual([kind, tool, true])
    }
    const local = catalogueHelper.visibleTools(host({ target: ConnectTarget.Local })).map(tool => tool.name)
    expect(GIT_TOOLS.filter(tool => local.includes(tool))).toEqual([])
    expect(PLATFORM_CATALOGUE.capabilities.find(group => group.id === 'git')?.tools).toEqual(GIT_TOOLS)
    // Nothing completes a GitHub authorization or hands a token over.
    expect(catalogue.map(tool => tool.name).filter(name => /github.*(complete|callback|token)|oauth/.test(name))).toEqual([])
    for (const name of ['git_status', 'git_history', 'github_repositories']) {
      expect(toolNamed(name).annotations.readOnlyHint).toBe(true)
    }
    for (const name of ['git_discard', 'git_revert', 'disconnect_github']) {
      expect(toolNamed(name).annotations.destructiveHint).toBe(true)
    }
  })

  test('git_status renders the connection, the tree and the next step', async () => {
    const { deps, calls } = connector({ 'git.status': STATE })

    const result = await toolNamed('git_status').run({}, deps)

    expect(calls).toEqual([['git.status', 'p1']])
    expect(result.text).toContain('GitHub: octo → octo/shop · published')
    expect(result.text).toContain('branch main · head abcdef1 feat: shop')
    expect(result.text).toContain('1 ahead, 0 behind')
    expect(result.text).toContain('M src/a.ts')
    expect(result.text).toContain('git_commit')
  })

  test('git_status says why the tree cannot be read while the preview is not ready', async () => {
    const { deps } = connector({ 'git.status': { connection: null, git: null } })

    const result = await toolNamed('git_status').run({ projectId: 'p2' }, deps)

    expect(result.text).toContain('not connected — connect_github')
    expect(result.text).toContain('preview_control')
  })

  test('the irreversible ones do nothing without confirm: true', async () => {
    const { deps, calls } = connector()

    for (const [name, args] of [
      ['git_discard', {}], ['git_revert', { hash: 'abc1234' }], ['disconnect_github', {}],
    ] as const) {
      const result = await toolNamed(name).run(args, deps)
      expect([name, result.isError]).toEqual([name, true])
      expect(result.text).toContain('confirm: true')
    }
    expect(calls).toEqual([])

    await toolNamed('git_revert').run({ hash: 'ABC1234', confirm: true }, deps)
    await toolNamed('git_discard').run({ confirm: true }, deps)
    await toolNamed('disconnect_github').run({ confirm: true }, deps)
    expect(calls).toEqual([['git.revert', 'p1', 'abc1234'], ['git.discard', 'p1'], ['github.disconnect', 'p1']])
  })

  test('git_commit and git_history reach their routes', async () => {
    const commit = {
      hash: 'f'.repeat(40), shortHash: 'fffffff', subject: 'feat: y', authorName: 'A', authorEmail: 'a@x',
      committedAt: '2026-10-03T00:00:00.000Z',
    }
    const { deps, calls } = connector({ 'git.commit': { commit }, 'git.log': [commit] })

    expect((await toolNamed('git_commit').run({ message: '  feat: y ' }, deps)).text).toBe('Committed fffffff feat: y.')
    expect((await toolNamed('git_history').run({}, deps)).text).toContain('- fffffff feat: y — A, 2026-10-03')
    expect(calls).toEqual([['git.commit', 'p1', 'feat: y'], ['git.log', 'p1']])
  })

  test('connect_github answers the address the user opens, and says the browser finishes it', async () => {
    const authorizeUrl = 'https://github.com/login/oauth/authorize?client_id=c&state=s'
    const { deps } = connector({ 'github.authorize': { authorizeUrl } })

    const result = await toolNamed('connect_github').run({}, deps)

    expect(result.text).toContain(authorizeUrl)
    expect(result.text).toContain('browser')
    expect(result.structured).toEqual({ projectId: 'p1', authorizeUrl })
  })

  test('publish_to_github names a new or an existing repository, never half of one', async () => {
    const connection = { ...STATE.connection! }
    const { deps, calls } = connector({ 'github.publish': connection })

    expect((await toolNamed('publish_to_github').run({ owner: 'acme' }, deps)).isError).toBe(true)
    await toolNamed('publish_to_github').run({ owner: 'acme', repo: 'shop' }, deps)
    await toolNamed('publish_to_github').run({ repoName: 'shop', private: false }, deps)
    expect(calls).toEqual([
      ['github.publish', 'p1', { existing: { owner: 'acme', repo: 'shop' } }],
      ['github.publish', 'p1', { repoName: 'shop', private: false }],
    ])
  })

  test('publish_to_github answers the origin refusal as a sentence', async () => {
    const { deps } = connector({ 'github.publish': new Error('conversion:publish-origin') })

    const result = await toolNamed('publish_to_github').run({ owner: 'acme', repo: 'shop' }, deps)

    expect(result.isError).toBe(true)
    expect(result.text).toContain('imported FROM')
  })

  test('github_sync pushes or pulls, and a refused sync is an error with what to do', async () => {
    const { deps, calls } = connector({
      'github.push': { status: 'ok', ahead: 0, behind: 0 },
      'github.pull': { status: 'auth-failed', ahead: null, behind: null },
    })

    const pushed = await toolNamed('github_sync').run({ direction: 'push' }, deps)
    const pulled = await toolNamed('github_sync').run({ direction: 'pull' }, deps)

    expect(pushed.isError).toBeUndefined()
    expect(pushed.text).toContain('push: done')
    expect(pulled.isError).toBe(true)
    expect(pulled.text).toContain('connect_github again')
    expect(calls).toEqual([['github.push', 'p1'], ['github.pull', 'p1']])
  })

  test('github_repositories lists repositories, or a named repository\'s branches', async () => {
    const { deps, calls } = connector({
      'github.repos': {
        repos: [{
          fullName: 'acme/shop', name: 'shop', owner: 'acme', url: 'u', private: true, defaultBranch: 'main',
          updatedAt: 'x', archived: false, fork: false, sizeKb: 1,
        }],
        page: 1, hasMore: true,
      },
      'github.branches': { branches: [{ name: 'main', protected: true }], page: 1, hasMore: false },
    })

    const repos = await toolNamed('github_repositories').run({ search: 'shop' }, deps)
    const branches = await toolNamed('github_repositories').run({ owner: 'acme', repo: 'shop', page: 2 }, deps)

    expect(repos.text).toContain('- acme/shop (private) · default branch main')
    expect(repos.text).toContain('More on page 2.')
    expect(branches.text).toContain('- main (protected)')
    expect(calls).toEqual([
      ['github.repos', 'p1', { search: 'shop' }],
      ['github.branches', 'p1', { owner: 'acme', repo: 'shop', page: 2 }],
    ])
    expect((await toolNamed('github_repositories').run({ repo: 'shop' }, deps)).isError).toBe(true)
  })

  test('link_github_origin records the origin, the default branch when none is named', async () => {
    const { deps, calls } = connector({ 'github.link': { connection: { ...STATE.connection!, status: 'connected' } } })

    const result = await toolNamed('link_github_origin').run({ owner: 'acme', repo: 'shop' }, deps)

    expect(result.text).toContain('acme/shop (its default branch)')
    expect(calls).toEqual([['github.link', 'p1', { owner: 'acme', repo: 'shop' }]])
  })

  test('the GitHub refusals point at the tools that cure them', () => {
    expect(refusalHelper.refusalPhrase(new Error('github:not-connected'))).toContain('connect_github')
    expect(refusalHelper.refusalPhrase(new Error('github:not-published'))).toContain('publish_to_github')
    expect(refusalHelper.refusalPhrase(new Error('oauth:invalid-or-expired-state'))).toContain('connect_github')
  })
})
