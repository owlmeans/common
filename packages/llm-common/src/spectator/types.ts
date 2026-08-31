import type { UsageMetadata } from '@langchain/core/messages'
import type { SpectatorContentType } from '../consts.js'
import type { LlmPurpose } from '../types.js'

/** What a caller hands to the spectator sink for a single completed model call. */
export interface SpectatorArgument {
  action: string
  retries: number
  tries?: number
  messages: SpectatorEntryMessage[]
  startedAt?: number
}

/** A stored spectator record — the argument plus the resolved call context. */
export interface SpectatorEntry extends SpectatorArgument {
  /**
   * Consumer-defined classification of the call. Open `string` so a consumer can
   * declare its own enum (e.g. `coder` / `fixer` / `general`) and stay assignable.
   */
  kind: string
  model: string
  purpose: LlmPurpose
  timestamp: number
}

/** A spectator record that has been persisted and has an identity. */
export interface SpectatorEntryLogged extends SpectatorEntry {
  id: string
}

/** One message (prompt or completion) inside a spectator entry. */
export interface SpectatorEntryMessage {
  type: string
  callType: string
  content: string
  name?: string
  contentType: SpectatorContentType
  usage?: UsageMetadata
  raw?: string
}
