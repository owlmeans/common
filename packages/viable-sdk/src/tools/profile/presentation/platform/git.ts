import { presentReadHelper as read } from './read.js'
import type { GitPresentHelper } from './types.js'

export const createGitPresentHelper = (): GitPresentHelper => {
  /** A commit as a person and git_revert read it: the hash kept, the author's e-mail dropped. */
  const commitOf = (value: unknown): Record<string, unknown> | null => {
    const commit = read.recordOrNull(value)
    if (commit == null) return null
    const hash = read.text(commit.hash)

    return read.compact({
      hash,
      shortHash: read.text(commit.shortHash, hash.slice(0, 7)),
      subject: read.text(commit.subject),
      author: read.text(commit.authorName),
      date: read.day(commit.committedAt),
    })
  }

  /** The GitHub connection: who connected it and where it publishes — never its record or a token. */
  const connectionOf = (value: unknown): Record<string, unknown> | null => {
    const connection = read.recordOrNull(value)

    return connection == null
      ? null
      : read.compact({
        githubLogin: read.text(connection.githubLogin),
        status: read.text(connection.status, 'unknown'),
        repoFullName: read.maybeText(connection.repoFullName),
        repoUrl: read.maybeText(connection.repoUrl),
      })
  }

  /** The working tree, or `null` while it cannot be read. */
  const treeOf = (value: unknown): Record<string, unknown> | null => {
    const tree = read.recordOrNull(value)
    if (tree == null) return null
    const changed = read.records(tree.files).map(change => ({ path: read.text(change.path), status: read.text(change.status) }))

    return {
      initialized: read.flag(tree.initialized),
      branch: read.text(tree.branch),
      head: commitOf(tree.head),
      dirty: read.flag(tree.dirty),
      changedFiles: read.count(tree.changedFiles, changed.length),
      files: changed,
      remoteUrl: read.textOrNull(tree.remoteUrl),
      ahead: read.countOrNull(tree.ahead),
      behind: read.countOrNull(tree.behind),
    }
  }

  const commitsOf = (value: unknown): Array<Record<string, unknown>> =>
    read.records(value).map(commitOf).filter((commit): commit is Record<string, unknown> => commit != null)

  const status = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    connection: connectionOf(structured.connection),
    git: treeOf(structured.git),
  }))

  const history = read.total((structured, args) => {
    const commits = commitsOf(structured.commits)

    return { projectId: read.project(structured, args), total: read.count(structured.total, commits.length), commits }
  })

  const commit = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    commit: commitOf(structured.commit),
  }))

  const discard = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    git: treeOf(structured.git),
  }))

  const revert = read.total((structured, args) => read.compact({
    projectId: read.project(structured, args),
    hash: read.maybeText(args.hash)?.trim().toLowerCase(),
    commit: commitOf(structured.commit),
    dbWarning: read.clean(structured.dbWarning),
  }))

  const authorize = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    authorizeUrl: read.text(structured.authorizeUrl),
  }))

  const published = read.total((structured, args) => ({
    projectId: read.project(structured, args),
    connection: connectionOf(structured.connection),
  }))

  const sync = read.total((structured, args) => read.compact({
    projectId: read.project(structured, args),
    direction: read.text(structured.direction, read.text(args.direction)),
    status: read.text(structured.status, 'unknown'),
    ahead: read.countOrNull(structured.ahead),
    behind: read.countOrNull(structured.behind),
    message: read.clean(structured.message),
  }))

  const disconnected = read.total((structured, args) => ({ projectId: read.project(structured, args), connection: null }))

  const repositories = read.total((structured, args) => read.compact({
    projectId: read.project(structured, args),
    owner: read.maybeText(structured.owner),
    repo: read.maybeText(structured.repo),
    page: read.count(structured.page, 1),
    hasMore: read.flag(structured.hasMore),
    repos: Array.isArray(structured.repos)
      ? read.records(structured.repos).map(repo => read.compact({
        fullName: read.text(repo.fullName),
        name: read.text(repo.name),
        owner: read.text(repo.owner),
        url: read.text(repo.url),
        private: read.flag(repo.private),
        defaultBranch: read.text(repo.defaultBranch),
        archived: read.flag(repo.archived),
        fork: read.flag(repo.fork),
        description: read.maybeText(repo.description),
        language: read.maybeText(repo.language),
        updated: read.day(repo.updatedAt),
      }))
      : undefined,
    branches: Array.isArray(structured.branches)
      ? read.records(structured.branches).map(branch => ({ name: read.text(branch.name), protected: read.flag(branch.protected) }))
      : undefined,
  }))

  const linked = read.total((structured, args) => read.compact({
    projectId: read.project(structured, args),
    owner: read.text(structured.owner, read.text(args.owner)),
    repo: read.text(structured.repo, read.text(args.repo)),
    branch: read.maybeText(structured.branch),
    connection: connectionOf(structured.connection),
  }))

  return { status, history, commit, discard, revert, authorize, published, sync, disconnected, repositories, linked }
}

export const gitPresentHelper = createGitPresentHelper()
