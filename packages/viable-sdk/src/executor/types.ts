
import type { spawn as nodeSpawn } from 'node:child_process'
import type { SlotCommandPayload, TargetIntegrityReport, TargetPaths } from '@owlmeans/viable-common'

/** How far the boot got. `ready` is the only success. */
// Kept as a type: a union of literal phases.
export type BootCheckPhase = 'build' | 'schema' | 'boot' | 'ready'

export interface BootCheckReport {
  ok: boolean
  phase: BootCheckPhase
  /** The classifier's reason plus the captured startup log, or null when the boot succeeded. */
  error: string | null
  dbOk?: boolean
}

export interface TargetHealthReading {
  /** The target says it is serving. */
  ready: boolean
  /** No amount of waiting changes this answer — the caller must act. */
  terminal: boolean
  /** Human-readable cause, '' when ready. */
  reason: string
  /** The answer came from a process this connector did not start. */
  foreign: boolean
  /** The phase the target reported, when it reported one. */
  phase?: string
  dbOk?: boolean
  valkeyOk?: boolean
}

export interface BootCheckDeps {
  port: number
  /** Argv marker that tells this instance apart from the live one for process matching. */
  marker: string
  cwd: string
  env: Record<string, string>
  bootId: string
  /** Omitted to reuse the artifacts already on disk. */
  build?: () => Promise<string | null>
  readHealth?: (port: number, bootId: string, timeoutMs: number) => Promise<TargetHealthReading>
  spawn?: typeof nodeSpawn
  ddlWindowMs?: number
  readyWindowMs?: number
  readyPollMs?: number
  /** Whole-run cap, so a wedged boot cannot outlive the caller's deadline. */
  timeoutMs?: number
}

export interface BootCheckStatus {
  running: boolean
  startedAt: number | null
  report: BootCheckReport | null
}

export interface BootCheckJob {
  /** Start a check, or join the one already running. `true` when this call started it. */
  start: (run: () => Promise<BootCheckReport>) => boolean
  status: () => BootCheckStatus
  /** The running check, for the legacy blocking caller. */
  pending: () => Promise<BootCheckReport> | null
}

/** What `readSource` and friends answer with — the shape the platform's file helpers parse. */
export interface LocalSourceFile {
  path: string
  code?: string
}

export interface SourceListOptions {
  skipUIElements?: boolean
  excludes?: string[]
}

/** The shape a target's `/api/healtz` answers with. Every field is optional by contract. */
export interface TargetHealthBody {
  phase?: string
  error?: string
  bootId?: string
  db?: { ok?: boolean, error?: string, summary?: string }
  /**
   * The target's own verdict on its job queue store, reported exactly like `db`.
   *
   * Absent from every target that has no queue — most of them — so an omitted value means
   * "nothing to report", never "unhealthy".
   */
  valkey?: { ok?: boolean, error?: string, summary?: string }
}

export interface TargetHealthInput {
  /** Boot id handed to the current child; '' when none was minted. */
  bootId: string
  /** Whether a TCP connect to the port succeeded at all. */
  listening: boolean
  /** HTTP status of the answer; null when the request never completed. */
  status: number | null
  /** Parsed body, or null when there was none or it was not JSON. */
  body: TargetHealthBody | null
  /** Why the request failed, when it did. */
  failure?: string
}

export interface TargetHealthProbes {
  probe?: (port: number) => Promise<boolean>
  fetch?: typeof globalThis.fetch
  /** The worker answers the same contract at a path of its own. */
  path?: string
}

export interface LocalSlotExecutorOptions {
  /** Where the executor's own diagnostics go. NEVER stdout for a stdio MCP server. */
  log?: (line: string) => void
}

export interface LocalSlotExecutor {
  /** Answer one slot command against the local tree. */
  execute: (payload: SlotCommandPayload) => Promise<unknown>
  /** Which tree this directory holds, re-read per call. */
  layout: () => TargetPaths
  /** Whether the tree is still the generated application. */
  integrity: () => Promise<TargetIntegrityReport>
  dir: string
}

export interface RunOptions {
  cwd: string
  env?: Record<string, string>
  /** Answer with stdout alone on failure — what a type check's diagnostics are. */
  stdoutOnly?: boolean
}
