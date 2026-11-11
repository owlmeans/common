import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { RouteParent } from '@owlmeans/route'
import type {
  BotActivity, BotConnection, BotConnectionInput, BotPlatformDescriptor, BotPlatformId, BotSimulateInput,
  BotSimulateResult,
} from '../types.js'

/** Where a bot tree mounts. Every leaf alias derives from `alias` (`<alias>:connection:list` …). */
export interface BotBaseOptions {
  alias: string
  /** The base path — `/bot/operator`, `/bot/member`, `/bot/hook`. */
  path: string
  parent?: RouteParent
  service?: string
}

/** The access gate the managing base carries — `EntrypointOptions['gate']`. */
export interface BotGateOptions {
  alias: string
  params?: string | readonly string[]
}

export interface BotProtocolOptions {
  base: BotBaseOptions
  /** The guard(s) the base carries; every leaf inherits them. */
  guards?: string | readonly string[]
  /** The ONE gate the base carries (a protocol has one gate); every leaf inherits it. */
  gates?: BotGateOptions
}

export interface BotHookProtocolOptions {
  base: BotBaseOptions
}

/** `:id` of a connection. */
export interface BotIdParams {
  id: string
}

export interface BotRemoveResult {
  id: string
}

export interface BotActivityQuery {
  connection?: string
  /** 1 … `BOT_ACTIVITY_LIMIT_MAX`; `BOT_ACTIVITY_LIMIT_DEFAULT` when absent. */
  limit?: number
}

/** The hook address: `/:platform/:connection`. */
export interface BotHookParams {
  platform: BotPlatformId
  connection: string
}

/** The platform's NATIVE payload — authenticated and normalized by the server, never by a schema. */
export interface BotHookPayload {
  [key: string]: unknown
}

/** What the receive hook answers: 200 at once, or a handshake's challenge as JSON. */
export interface BotHookReply {
  ok?: boolean
  challenge?: string
}

/**
 * The query of a subscription handshake a platform sends as a GET — its keys are the platform's own,
 * and its plugin reads them and names the text the hook answers with.
 */
export interface BotChallengeQuery {
  [key: string]: string | string[] | undefined
}

/** The platforms branch of a managing tree. */
export interface BotPlatformProtocols {
  /** The descriptors of the platforms the server registered a plugin for, in registration order. */
  list: EntrypointProtocol<{}, BotPlatformDescriptor[]>
}

/**
 * A managing tree as a server binds it and a client calls it — what `serveBotEntrypoints` and the
 * web panels take. `platform` is optional: a tree restated leaf by leaf before that leaf existed
 * still binds and still renders (its panels then have no platform to offer).
 */
export interface BotSurfaceProtocols {
  /** Carries the guards and the gate; every leaf hangs under it. */
  base: EntrypointProtocol<OpenRequest, OpenValue>
  connection: {
    list: EntrypointProtocol<{}, BotConnection[]>
    save: EntrypointProtocol<{ body: BotConnectionInput }, BotConnection>
    verify: EntrypointProtocol<{ params: BotIdParams }, BotConnection>
    remove: EntrypointProtocol<{ params: BotIdParams }, BotRemoveResult>
    /** Mock transport only — a live connection answers `BotTransportMismatch` (409). */
    simulate: EntrypointProtocol<{ params: BotIdParams, body: BotSimulateInput }, BotSimulateResult>
  }
  activity: {
    /** Newest first. */
    list: EntrypointProtocol<{ query: BotActivityQuery }, BotActivity[]>
  }
  platform?: BotPlatformProtocols
}

/** The managing surface of one mount (operator or member), as `makeBotProtocols` declares it. */
export interface BotProtocols extends BotSurfaceProtocols {
  platform: BotPlatformProtocols
}

/** The platforms' inbound surface — no guard: the platform signs. */
export interface BotHookProtocols {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  receive: EntrypointProtocol<{ params: BotHookParams, body: BotHookPayload }, BotHookReply>
  challenge: EntrypointProtocol<{ params: BotHookParams, query: BotChallengeQuery }, string>
}
