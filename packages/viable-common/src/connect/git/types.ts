/**
 * A cloud target's git repository and its GitHub connection, as a connector reads them.
 *
 * Self-contained mirrors of the platform's own git vocabulary (`@owlmeans/git/model` and the
 * platform's `GithubConnection`): the connector contract depends on no git package, so these name the
 * same fields and nothing more. A status is a plain string for the same reason a slot's is — this
 * view crosses a version skew, and a newer platform may answer with a value an older connector has
 * never heard of.
 *
 * NOTHING here carries the GitHub token. The platform stores it locked and relays it only to the
 * project's own slot; no connector answer, and no field of any shape below, can hold it.
 */

/** One commit of the project's repository. */
export interface ConnectGitCommit {
  hash: string
  shortHash: string
  subject: string
  authorName: string
  authorEmail: string
  committedAt: string
}

/** One changed path of the working tree, with git's porcelain status letters. */
export interface ConnectGitFileChange {
  path: string
  status: string
}

/** The working tree: its branch and head, what changed, and where it stands against its remote. */
export interface ConnectGitStatus {
  initialized: boolean
  head: ConnectGitCommit | null
  branch: string
  dirty: boolean
  changedFiles: number
  /** The changed paths — capped by the platform; `changedFiles` is the whole count. */
  files: ConnectGitFileChange[]
  /** The credential-free remote the project publishes to, once it has been published. */
  remoteUrl: string | null
  ahead: number | null
  behind: number | null
}

/**
 * The project's GitHub connection — who connected it and where it publishes. `status` is `connected`
 * (authorized, not published yet), `published` (push and pull work) or `invalid` (GitHub refused the
 * stored access: it has to be connected again).
 */
export interface ConnectGithubConnection {
  projectId: string
  githubLogin: string
  repoFullName?: string
  repoUrl?: string
  status: string
  connectedAt: string
}

/**
 * The project's git state: its GitHub connection (`null` when none) and its working tree (`null`
 * while the preview is not ready — git lives in the preview's pod, and reading it there would start
 * a stopped preview).
 */
export interface ConnectGitState {
  connection: ConnectGithubConnection | null
  git: ConnectGitStatus | null
}

/** A commit of every change in the working tree. */
export interface ConnectGitCommitBody {
  message: string
}

/** What a commit made — `null` when there was nothing to commit. */
export interface ConnectGitCommitResult {
  commit: ConnectGitCommit | null
}

/** Go back to the tree of one earlier commit, as a NEW commit (history is never rewritten). */
export interface ConnectGitRevertBody {
  hash: string
}

/**
 * What a revert made. `dbWarning` is what the project's database migration said after the tree went
 * back — a schema the older code no longer matches is reported, never silently left.
 */
export interface ConnectGitRevertResult {
  commit: ConnectGitCommit | null
  dbWarning?: string | null
}

/**
 * A push or a pull: `ok`, `up-to-date`, `conflict` (a pull that could not merge — aborted, nothing
 * changed), `rejected` (the remote moved: pull first), `no-remote` or `auth-failed` (GitHub refused
 * the stored access; the connection is then `invalid`).
 */
export interface ConnectGitSyncResult {
  status: string
  ahead: number | null
  behind: number | null
  message?: string
}

/**
 * The address the PERSON opens to connect GitHub. The authorization finishes in their browser — GitHub
 * returns to the platform's web application, which completes it; nothing a connector can call does.
 */
export interface ConnectGithubAuthorize {
  authorizeUrl: string
}

/**
 * Publish the project to GitHub: a new repository (`repoName`, private unless `private` is false) or
 * one that exists (`existing`). The repository a converted project came FROM is refused while its
 * original sources are still on the volume.
 */
export interface ConnectGithubPublishBody {
  repoName?: string
  private?: boolean
  existing?: { owner: string, repo: string }
}

/** The connection after a disconnect — there is none. */
export interface ConnectGithubDisconnected {
  connection: null
}

/** One page of the person's repositories; `search` narrows the page that came back. */
export interface ConnectGithubRepoQuery {
  page?: number
  search?: string
}

/** One repository as the picker lists it. */
export interface ConnectGithubRepo {
  fullName: string
  name: string
  owner: string
  url: string
  private: boolean
  defaultBranch: string
  updatedAt: string
  archived: boolean
  fork: boolean
  sizeKb: number
  description?: string
  language?: string
}

export interface ConnectGithubRepoList {
  repos: ConnectGithubRepo[]
  page: number
  hasMore: boolean
}

/** One page of one repository's branches. */
export interface ConnectGithubBranchQuery {
  owner: string
  repo: string
  page?: number
}

export interface ConnectGithubBranch {
  name: string
  protected: boolean
}

export interface ConnectGithubBranchList {
  branches: ConnectGithubBranch[]
  page: number
  hasMore: boolean
}

/**
 * Record which repository an imported project came FROM — it pushes nothing and publishes nothing.
 * Absent `branch` is the repository's own default branch, read back from GitHub.
 */
export interface ConnectGithubLinkBody {
  owner: string
  repo: string
  branch?: string
}

export interface ConnectGithubLinked {
  connection: ConnectGithubConnection
}
