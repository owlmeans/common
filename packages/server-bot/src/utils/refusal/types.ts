import type { BotActionKind, BotPlatformDescriptor } from '@owlmeans/bot'

/** A failed action as its result and its activity carry it. */
export interface BotRefusal {
  /** ONE short sentence a person — or an agent's model — reads. */
  error: string
  /** The machine marker (`bot:<marker>:<detail>`, as the failure stated it) — what code compares. */
  code: string
}

/** Turns what made an action fail into its sentence and keeps its marker beside it. */
export interface RefusalUtils {
  /**
   * `failure` is a marker decided before any call (`bot:invalid-action:empty-text`) or what the
   * plugin threw; `kind` is the action; `descriptor` (the registered plugin's) names the platform in
   * the sentence and the credential an action needs — `The platform` without one.
   *
   * A platform's API error is `bot:platform:<id>:<codes or the API method>:<the platform's words>`:
   * the sentence keeps the words ("Acme refused: message to delete not found."); a transport fault
   * ending in `unreachable` / `timeout` says the platform could not be reached / did not answer.
   */
  of: (failure: unknown, kind: BotActionKind, descriptor?: BotPlatformDescriptor | null) => BotRefusal
}
