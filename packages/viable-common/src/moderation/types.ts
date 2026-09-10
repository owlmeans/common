import type { ModerationCategory, ModerationSubject } from './consts.js'

/**
 * What the moderation classifier returns.
 *
 * `evidence` is diagnostic only — it reaches the trace and the logs, never the user. What the
 * user is told derives from `category` in the browser, so a refusal reads the same in all
 * seven languages and the model never gets to write UI copy.
 */
export interface ModerationVerdict {
  allowed: boolean
  /**
   * Free string on the wire, narrowed to {@link ModerationCategory} by `normalizeCategory`.
   * A model that is allowing has nothing to categorise and will still put something here.
   */
  category?: string
  evidence?: string
}

/**
 * The three outcomes, separated from the IO so the policy can be read and tested on its own.
 *
 * `shadow` means the verdict was negative and is being recorded but not acted on.
 */
export type ModerationAction = 'allow' | 'refuse' | 'shadow'

/**
 * The two operational levers on the gate.
 *
 * Both exist because a blocking classifier will eventually be wrong about a real customer, and
 * at that moment the fix has to be faster than a deploy. `enforce: false` keeps the verdicts
 * flowing into the traces while refusing nothing, which is also how a change to the policy
 * prompt should be evaluated before it is trusted.
 */
export interface ModerationPolicy {
  /** Defaults to ON. Set false to compute and trace verdicts without acting on them. */
  enforce?: boolean
  /** Entity ids released from the gate entirely. */
  bypassEntities?: string[]
}

/** What a caller needs in order to refuse: never the model's own words. */
export interface ModerationOutcome {
  action: ModerationAction
  /**
   * Always present when `action` is not `allow`.
   *
   * A refusal has to tell the user something specific, so an unrecognized category from the
   * model is replaced rather than dropped — see `normalizeCategory`.
   */
  category?: ModerationCategory
  /** Diagnostic only. Logged and traced, never rendered. */
  evidence?: string
}

/** One classification request. */
export interface ModerationInput {
  subject: ModerationSubject
  /** One text, or several judged together — several is one call, not several. */
  text: string | string[]
  /** Whose request this is — the one thing a bypass can be keyed on. */
  entityId?: string
  /**
   * Extra framing appended to the subject's own, for a subject whose meaning depends on where
   * the text came from — a file's path, for instance.
   */
  context?: string
}
