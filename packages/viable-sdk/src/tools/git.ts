import type { ConnectGitCommit, ConnectGithubConnection } from '@owlmeans/viable-common'
import { GIT_FILES_SHOWN, GIT_SYNC_WORDS, GITHUB_STATUS_WORDS } from './consts.local.js'
import type { GitToolHelper } from './git/types.js'

export const createGitToolHelper = (): GitToolHelper => {
  const day = (iso: string): string => iso.slice(0, 10)

  const commitLine = (commit: ConnectGitCommit): string =>
    `${commit.shortHash} ${commit.subject} — ${commit.authorName}, ${day(commit.committedAt)}`

  const renderConnection = (connection: ConnectGithubConnection | null): string => connection == null
    ? 'GitHub: not connected — connect_github gives the user the address to authorize it'
    : `GitHub: ${connection.githubLogin}${connection.repoFullName != null ? ` → ${connection.repoFullName}` : ''}`
      + ` · ${GITHUB_STATUS_WORDS[connection.status] ?? connection.status}`

  const renderState: GitToolHelper['renderState'] = ({ connection, git }) => {
    const lines = [renderConnection(connection)]
    if (git == null) {
      lines.push('working tree: not readable now — git lives in the preview, which is not ready.'
        + ' preview_control { action: start } starts it; then call git_status again.')

      return lines.join('\n')
    }
    if (!git.initialized) {
      lines.push('working tree: no repository yet — the first commit creates it.')

      return lines.join('\n')
    }
    lines.push(`branch ${git.branch}${git.head != null ? ` · head ${commitLine(git.head)}` : ' · no commits yet'}`)
    if (git.ahead != null || git.behind != null) {
      lines.push(`against GitHub: ${git.ahead ?? 0} ahead, ${git.behind ?? 0} behind`)
    }
    if (git.dirty) {
      lines.push(`${git.changedFiles} uncommitted change(s):`)
      lines.push(...git.files.slice(0, GIT_FILES_SHOWN).map(file => `  ${file.status} ${file.path}`))
      if (git.changedFiles > Math.min(git.files.length, GIT_FILES_SHOWN)) {
        lines.push(`  … and ${git.changedFiles - Math.min(git.files.length, GIT_FILES_SHOWN)} more`)
      }
      lines.push('next: git_commit { message } keeps them; git_discard throws them away (confirm: true).')
    } else {
      lines.push('working tree: clean')
    }

    return lines.join('\n')
  }

  const renderHistory: GitToolHelper['renderHistory'] = commits => commits.length < 1
    ? 'No commits yet.'
    : [
      `${commits.length} latest commit(s), newest first:`,
      ...commits.map(commit => `- ${commitLine(commit)}`),
      'next: git_revert { hash, confirm: true } brings one commit\'s tree back as a new commit.',
    ].join('\n')

  const renderSync: GitToolHelper['renderSync'] = (direction, result) => {
    const words = GIT_SYNC_WORDS[result.status] ?? result.status
    const position = result.ahead != null || result.behind != null
      ? ` (${result.ahead ?? 0} ahead, ${result.behind ?? 0} behind)`
      : ''

    return `${direction}: ${words}${position}.`
      + (result.message != null && result.message !== '' && result.status !== 'ok' && result.status !== 'up-to-date'
        ? `\ngit said: ${result.message}`
        : '')
      + (direction === 'pull' && result.status === 'ok' ? '\nThe preview was rebuilt from the pulled tree.' : '')
  }

  const renderRepos: GitToolHelper['renderRepos'] = (list, search) => list.repos.length < 1
    ? `No repositories on page ${list.page}${search != null ? ` matching "${search}"` : ''}.`
      + (list.hasMore ? ` More on page ${list.page + 1}.` : '')
    : [
      `page ${list.page}${search != null ? ` (matching "${search}" on this page)` : ''}:`,
      ...list.repos.map(repo => `- ${repo.fullName}${repo.private ? ' (private)' : ''} · default branch`
        + ` ${repo.defaultBranch}${repo.archived ? ' · archived' : ''}${repo.fork ? ' · fork' : ''}`
        + `${repo.language != null ? ` · ${repo.language}` : ''}`),
      ...(list.hasMore ? [`More on page ${list.page + 1}.`] : []),
      'next: github_repositories { owner, repo } lists a repository\'s branches.',
    ].join('\n')

  const renderBranches: GitToolHelper['renderBranches'] = (fullName, list) => list.branches.length < 1
    ? `${fullName} has no branches on page ${list.page}.`
    : [
      `${fullName}, page ${list.page}:`,
      ...list.branches.map(branch => `- ${branch.name}${branch.protected ? ' (protected)' : ''}`),
      ...(list.hasMore ? [`More on page ${list.page + 1}.`] : []),
    ].join('\n')

  const renderAuthorize: GitToolHelper['renderAuthorize'] = authorizeUrl => [
    'Ask the user to open this address in the browser where they are signed in to OwlMeans:',
    authorizeUrl,
    'GitHub asks them to authorize access to their repositories; it then returns to the OwlMeans web'
    + ' application, which finishes connecting this project. The address works once, for ten minutes.',
    'next: once they say it is done, git_status shows the connection.',
  ].join('\n')

  return { renderConnection, renderState, renderHistory, renderSync, renderRepos, renderBranches, renderAuthorize }
}

export const gitToolHelper = createGitToolHelper()
