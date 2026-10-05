import { ModerationCategory } from '@owlmeans/viable-common'

/** What a production body leaves of a confirmation or consent refusal (`@owlmeans/api` `ApiStatusError`). */
export const BARE_428 = 'api:client:status:428'

/** What a conversion costs, in the words both conversion verbs' descriptions use. */
export const CONVERSION_COST = 'A plan that includes a project conversion covers its AI work up to the'
  + ' conversion limit (1,000,000 credits); beyond it the organization\'s credit limits are spent first,'
  + ' then topped-up credits, and every stage has an estimate. A step that would use the plan\'s'
  + ' conversion or spend credits first answers with what it costs and starts nothing: tell the user,'
  + ' and repeat the call with confirm: true only after they agree. A conversion your own agent performs'
  + ' (its model calls delegated to you) spends no credits and is never asked.'

/**
 * How much of a drafted field one status answer carries.
 *
 * Generous, because reading the specification IS the confirm step — but bounded, since a tool
 * answer shares one output budget with everything else the host is holding.
 */
export const DRAFT_CAP = 8_000

/** What each moderation category refused, in the words the refusal is explained with. */
export const MODERATION: Record<string, string> = {
  [ModerationCategory.CredentialHarvesting]:
    'collecting other people\'s passwords, one-time codes or card details',
  [ModerationCategory.BrandImpersonation]:
    'presenting itself as another company or as a real person',
  [ModerationCategory.PaymentCapture]:
    'taking payment details on behalf of a merchant the requester does not run',
  [ModerationCategory.AbuseTooling]:
    'abuse — unsolicited bulk messaging, credential stuffing or phishing kits',
}

/** A stack frame, as every runtime prints one. */
export const STACK_FRAME = /^\s+at\s/

/**
 * Wire text a refusal travels as — `package:family:reason`, with any detail after it.
 *
 * What separates an unphrased MARKER from the other things this same field carries: a deadline
 * message, a build warning, a gateway error. Only a marker earns the next-step half, because only
 * a marker is a refusal the parent can neither read nor act on; a build warning is diagnostics
 * somebody asked for and is returned exactly as it stands.
 */
export const MARKER_SHAPE = /^[a-z][\w-]*(?::[\w.-]+)+/
