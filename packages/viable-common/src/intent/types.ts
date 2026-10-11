import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { ResourceRecord } from '@owlmeans/resource'

/** What the public site sends: the prompt and the person's confirmation of its processing. */
export interface IntentStashBody {
  prompt: string
  /** Always `true` — the site's checkbox; a request without it is refused by the schema. */
  consent: true
}

/** The reference the platform answers with, and the moment its record expires. */
export interface IntentStashResult {
  ref: string
  /** Epoch milliseconds. */
  expiresAt: number
}

export interface IntentPickupBody {
  ref: string
}

export interface IntentPickupResult {
  prompt: string
}

/**
 * The prompt as it waits in the visitor's browser between pickup and the decision on the home
 * screen. `expiresAt` is checked on read — browser storage has no TTL of its own.
 */
export interface IntentDraft extends ResourceRecord {
  id: string
  /** The reference it was picked up with; a reload of the landing reuses the draft of that ref. */
  ref: string
  prompt: string
  expiresAt: number
}

/**
 * Options of {@link makeIntentProtocols}.
 */
export interface IntentProtocolOptions {
  /** Path prefix of the guest API; defaults to `/public/intent`. */
  path?: string
  /** Path of the landing screen; defaults to `/start`. */
  landing?: string
}

/** The intent-first hand-off tree {@link makeIntentProtocols} declares. */
export interface IntentProtocols {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  stash: EntrypointProtocol<{ body: IntentStashBody }, IntentStashResult>
  pickup: EntrypointProtocol<{ body: IntentPickupBody }, IntentPickupResult>
  /** The landing screen — `sticky`, an in-app screen a visitor reaches from another origin. */
  landing: EntrypointProtocol<OpenRequest, OpenValue>
}
