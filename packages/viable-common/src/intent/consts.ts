/**
 * The intent-first hand-off — how a prompt typed on the public site reaches the platform.
 *
 * A visitor types the idea for a project on the marketing site before they have an account. The
 * site cannot write into the platform's browser storage (IndexedDB is per origin) and must not put
 * the prompt in a URL, so the prompt takes a short detour through the platform's own cache: the
 * site stashes it behind an unguessable reference, sends the browser to the platform with only that
 * reference, and the platform picks the prompt up once — after which it lives in the visitor's own
 * browser until they decide what to do with it.
 *
 * Everything here is serializable and runtime-free: the site, the manager API and the manager web
 * read the same declarations, and none of them may reinvent a name the others parse.
 */

/** Every address of the hand-off. API routes are guest routes; the landing is a screen. */
export const intent = Object.freeze({
  base: 'viable:manager-api:intent:base',
  stash: 'viable:manager-api:intent:stash',
  pickup: 'viable:manager-api:intent:pickup',
  landing: 'viable:manager-web:intent:landing',
} as const)

/** Where the guest API lives, and the screen the visitor's browser is sent to. */
export const INTENT_API_PATH = '/public/intent'
export const INTENT_LANDING_PATH = '/start'

/** The flow the two sides walk. */
export const INTENT_FLOW = 'viable:intent'

/**
 * How long the platform keeps a stashed prompt waiting for pickup. Short on purpose: the pickup
 * happens the moment the browser lands, so anything older was abandoned, and a prompt is personal
 * data the platform has no business holding once nobody is coming for it.
 */
export const INTENT_TTL_SECONDS = 120

/** The longest prompt the platform will create a project from (`PromptSchema` in viable). */
export const INTENT_PROMPT_MAX = 8192

/**
 * The reference's shape: `createIdOfLength(24)` — Base58, so no `0`, `O`, `I` or `l`. Anything else
 * is refused before the cache is asked, which keeps a crafted reference from ever being a key.
 */
export const INTENT_REF_LENGTH = 24
export const INTENT_REF_PATTERN = '^[1-9A-HJ-NP-Za-km-z]{24}$'

/** The flow payload key carrying the reference — short, because a payload is CSV-joined. */
export const INTENT_PAYLOAD_REF = 'ref'

/** How long the visitor's draft survives in their own browser waiting for a decision. */
export const INTENT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000

/** How long a suspended landing waits while the visitor signs in or registers. */
export const INTENT_SUSPEND_TTL_MS = 30 * 60 * 1000

/** Steps of {@link intentFlow}, exported so a screen never spells one as a literal. */
export enum IntentFlowStep {
  /** The public site: the prompt is typed and stashed. */
  Compose = 'compose',
  /** The platform's landing screen: the stash is picked up. */
  Land = 'land',
  /** The platform's own sign-in dispatcher. */
  SignIn = 'sign-in',
  /** The platform's home screen, where the draft is offered back. */
  Review = 'review',
}
