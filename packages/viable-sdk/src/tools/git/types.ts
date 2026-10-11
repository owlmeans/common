import type {
  ConnectGitCommit, ConnectGitState, ConnectGitSyncResult, ConnectGithubBranchList, ConnectGithubConnection,
  ConnectGithubRepoList,
} from '@owlmeans/viable-common'

/** How the git and GitHub tools put the platform's answers into words. */
export interface GitToolHelper {
  /** The connection in one line: who connected it, where it publishes, and whether it still works. */
  renderConnection: (connection: ConnectGithubConnection | null) => string
  /**
   * The whole git state: the GitHub connection, then the working tree — or why it cannot be read now
   * (the preview is not ready) — and what to do next.
   */
  renderState: (state: ConnectGitState) => string
  /** The latest commits, newest first, each with the hash a revert names. */
  renderHistory: (commits: ConnectGitCommit[]) => string
  /** What a push or a pull did, and what to do about a refusal. */
  renderSync: (direction: string, result: ConnectGitSyncResult) => string
  /** One page of repositories, with how to reach the next. */
  renderRepos: (list: ConnectGithubRepoList, search?: string) => string
  /** One page of one repository's branches. */
  renderBranches: (fullName: string, list: ConnectGithubBranchList) => string
  /**
   * The address the user opens to connect GitHub, with what happens there and after it — the
   * authorization ends in their browser, never in a tool.
   */
  renderAuthorize: (authorizeUrl: string) => string
}
