import type { ConnectMarker } from '@owlmeans/viable-common'

export interface TargetEnv {
  /** Project-relative path → the values that file declares. */
  files: Record<string, Record<string, string>>
  /** Everything the target's processes see, later files overriding earlier ones. */
  values: Record<string, string>
}

export interface DiscoveredProject {
  /** The directory holding `.viable/connect.json` — the project root, not where the search began. */
  dir: string
  marker: ConnectMarker
}

export interface ServiceState {
  /** A connection string is present in the project's own half of the `.env`. */
  configured: boolean
  /** Something answers where it points. False for an unset URL and for one nothing listens on. */
  reachable: boolean
  /** The value, with everything between the scheme and the host removed. */
  redacted?: string
}

export interface SetupReport {
  dir: string
  /** Only a project with a worker needs a queue store; for the rest it is noise. */
  needsWorker: boolean
  database: ServiceState
  queue: ServiceState
  /** The command-line tools the paths below depend on. */
  tools: { bun: boolean, git: boolean, docker: boolean }
  platform: NodeJS.Platform
  /** Whether the file holding these values is kept out of the project's history. */
  envIgnored: boolean
}
