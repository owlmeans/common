import type { ConsentView } from '@owlmeans/oauth'

export type ConsentStage = 'checking' | 'signing-in' | 'loading' | 'ready' | 'deciding' | 'done' | 'error'

/** Why the screen cannot go on — the screen phrases each kind as ONE sentence, never the wire text. */
export type ConsentErrorKind = 'missing' | 'not-found' | 'expired' | 'forbidden' | 'failed'

export interface UseOAuthConsent {
  stage: ConsentStage
  view: ConsentView | null
  /** The raw failure, for a log; what a person reads is `errorKind`. */
  error: string | null
  errorKind: ConsentErrorKind | null
  approve: () => Promise<void>
  deny: () => Promise<void>
  /** Sign the current session out and go through the sign-in again, returning to this request. */
  switchAccount: () => Promise<void>
}
