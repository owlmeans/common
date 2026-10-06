import type { ConnectHarness } from '@owlmeans/viable-common'

export interface InstallResult {
  written: string[]
  skipped: string[]
}

export interface InstallOptions {
  /** Whether to write the MCP server entry, which names a file the agent's own tooling owns. */
  mcpConfig?: boolean
}

export interface HarnessFile {
  path: string
  content: string
  /** A section inside a larger file the user also owns; merged rather than overwritten. */
  section?: boolean
  /** A JSON file this entry merges one key into, rather than replacing. */
  jsonKey?: string[]
}

/** Set a coding agent up to work with the platform: its subagent, its instruction section, its MCP entry. */
export interface HarnessHelper {
  /** What would be written, without writing it. */
  describeHarness: (harness: ConnectHarness) => HarnessFile[]
  /**
   * Set a coding agent up to work with the platform.
   *
   * Idempotent by construction: a section is replaced between its markers, a JSON entry is merged
   * under its own key, and a whole file is only rewritten when its content actually differs. Running
   * it twice changes nothing, which is what makes it safe to offer as a tool the agent may call
   * whenever it is unsure.
   *
   * No file it writes contains the token — each configuration references the environment variable in
   * whatever syntax its harness uses, so the result is safe to commit.
   */
  installHarness: (dir: string, harness: ConnectHarness, opts?: InstallOptions) => Promise<InstallResult>
}
