import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { RouteParent } from '@owlmeans/route'
import type { BotPlatform } from '../consts.js'
import type {
  BotActivity, BotConnection, BotConnectionInput, BotSimulateInput, BotSimulateResult,
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
  platform: BotPlatform
  connection: string
}

/** The platform's NATIVE payload — authenticated and normalized by the server, never by a schema. */
export interface BotHookPayload {
  [key: string]: unknown
}

/** What the receive hook answers: 200 at once, or a handshake's challenge (Slack `url_verification`). */
export interface BotHookReply {
  ok?: boolean
  challenge?: string
}

/** The subscription handshake WhatsApp sends as a GET (`hub.*`); answered with `hub.challenge`. */
export interface BotChallengeQuery {
  'hub.mode'?: string
  'hub.verify_token'?: string
  'hub.challenge'?: string
}

/** The managing surface of one mount (operator or member). */
export interface BotProtocols {
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
}

/** The platforms' inbound surface — no guard: the platform signs. */
export interface BotHookProtocols {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  receive: EntrypointProtocol<{ params: BotHookParams, body: BotHookPayload }, BotHookReply>
  challenge: EntrypointProtocol<{ params: BotHookParams, query: BotChallengeQuery }, string>
}
