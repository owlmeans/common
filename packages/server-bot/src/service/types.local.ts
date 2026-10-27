import type {
  BotActionKind, BotActivityTarget, BotConnection, BotPlatform, BotSimulateInput, BotSimulateResult, BotUpdate,
} from '@owlmeans/bot'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { Logger } from '@owlmeans/log'
import type { Resource } from '@owlmeans/resource'
import type { BotSealer } from '../helpers/crypto/types.js'
import type { BotPlatformRegistry } from '../platforms/registry/types.js'
import type { BotFetch, BotPlatformAction, BotPlatformConnection, BotPlatformSession } from '../platforms/types.js'
import type {
  BotActions, BotActionsTarget, BotActivityApi, BotActivityRecord, BotConnectionRecord, BotHandler, BotHookAnswer,
  BotHookRequest, BotHookUrlMaker, BotRuntime, BotUpdateRecord,
} from '../types.js'

/** The three stores, resolved by alias on every call (a store package registers them separately). */
export interface BotStore {
  connections: () => Resource<BotConnectionRecord>
  updates: () => Resource<BotUpdateRecord>
  activities: () => Resource<BotActivityRecord>
}

export interface BotResolvedOptions {
  hookUrl: BotHookUrlMaker
  fetch: () => BotFetch
  secret: () => string | undefined
  pollMs: number
  reconcileMs: number
  attempts: number
  leaseMs: number
  retainMs: number
}

/** What every part of the service shares. */
export interface BotServiceParts {
  context: () => BasicContext<BasicConfig>
  store: BotStore
  registry: BotPlatformRegistry
  options: BotResolvedOptions
  now: () => Date
  log: Logger
}

/** Connection records as the rest of the service needs them. */
export interface BotSessions {
  /** The deployment's sealer, `null` without a secret. */
  sealer: () => BotSealer | null
  /** @throws {BotSecretMissing} */
  requireSealer: () => BotSealer
  /** The client view; `credentialsSet` includes the generated credentials (they default to the hook secret). */
  view: (record: BotConnectionRecord, lastEventAt?: string) => BotConnection
  /**
   * The plugin's view, credentials opened (generated ones defaulted to the hook secret). `strict`
   * throws when sealed credentials cannot be opened; otherwise they read as none.
   */
  open: (record: BotConnectionRecord, strict?: boolean) => BotPlatformConnection
  /** A plugin call's session over the connection's transport (credentials opened strictly). */
  session: (record: BotConnectionRecord) => BotPlatformSession
  /** @throws {BotConnectionNotFound} absent or another scope's */
  find: (scope: string, id: string) => Promise<BotConnectionRecord>
  /** The newest inbox row's `receivedAt`. */
  lastEventOf: (connection: string) => Promise<string | undefined>
  /** `now()` as ISO text. */
  stamp: (offsetMs?: number) => string
}

export interface BotActivityPart extends BotActivityApi {
  /** Append one activity; a store failure is logged, never thrown. */
  record: (activity: Omit<BotActivityRecord, 'id' | 'at'>) => Promise<void>
}

/** One inbox row a normalized update became. */
export interface BotInboxEntry {
  id: string
  /** Its dedupe key was already stored: the existing row, nothing new to dispatch. */
  duplicate: boolean
}

export interface BotInbox {
  receive: (platform: BotPlatform, connection: string, request: BotHookRequest) => Promise<BotHookAnswer>
  simulate: (scope: string, connection: string, input: BotSimulateInput) => Promise<BotSimulateResult>
  /** Normalize and store a native payload of an already trusted source (a receiver) — the inbox row ids. */
  accept: (record: BotConnectionRecord, payload: unknown) => Promise<string[]>
}

export interface BotActionsPart {
  actions: (target: BotActionsTarget) => Promise<BotActions>
  /** Actions over a connection already in hand; `update` is recorded on every activity. */
  actionsOf: (record: BotConnectionRecord | null, scope: string, connection: string, update?: BotUpdate) => BotActions
}

export interface BotRuntimePart {
  runtime: (handlers: readonly BotHandler<any>[]) => BotRuntime
}

/** A receiver the runtime runs. */
export interface BotRunningReceiver {
  /** The connection's `updatedAt` + transport: a change restarts the receiver. */
  key: string
  controller: AbortController
  done: Promise<void>
}

/** One action as `perform` runs it: what to record, and the platform call (absent for `note`). */
export interface BotActionPlan {
  kind: BotActionKind
  target?: BotActivityTarget
  text?: string
  update?: string
  /** The handler's opaque reference, recorded on the activity. */
  ref?: string
  /** A refusal decided before any call (a missing target, an empty text). */
  invalid?: string
  /** The platform call; absent for `note`. */
  action?: BotPlatformAction
}
