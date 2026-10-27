import type { BotActionKind, BotPlatform } from '@owlmeans/bot'

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
   * plugin threw; `kind` is the action, `platform` names it in the sentence.
   *
   * A platform's API error is `bot:<platform>:<codes or the Web API method>:<the platform's words>`:
   * the sentence keeps the words ("Telegram refused: message to delete not found."); a transport
   * fault ending in `unreachable` / `timeout` says the platform could not be reached / did not answer.
   */
  of: (failure: unknown, kind: BotActionKind, platform?: BotPlatform) => BotRefusal
}
