import { LoginOutcome } from './consts.js'
import type { CSSProperties } from 'react'

/**
 * The page the card sits in.
 *
 * It carries its own viewport height because this screen is rendered straight out of the
 * dispatcher, into whatever the application happens to have around it — which is usually nothing
 * with a height, so a percentage minimum would resolve to zero and leave the card at the top.
 */
export const page: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: '100dvh', padding: '1rem',
  fontFamily: 'system-ui, sans-serif', lineHeight: 1.5,
}

// Centred throughout, so the plain screen and the styled one read the same way.
export const box: CSSProperties = {
  width: '100%', maxWidth: '24rem', padding: '1.5rem', textAlign: 'center',
}

/** The one action of a failed sign-in — the way back, or the retry. */
export const failureAction: CSSProperties = {
  display: 'inline-block', marginTop: '1rem', padding: '.625rem 1rem', fontSize: '1rem',
  cursor: 'pointer', borderRadius: '.375rem', border: '1px solid currentColor', background: 'transparent',
  color: 'inherit',
}

/** The library resource the sign-in copy is registered in (`i18n.ts`), in the `lib` namespace. */
export const LOGIN_I18N_RESOURCE = 'auth'

/** The same English fallback a document's `i18nKey` translates to when nothing else names it. */
export const DEFAULT_LABEL: Record<string, string> = {
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
  billing: 'Billing Terms',
  product: '{{product}} Product Terms',
}

/** Outcomes after which nobody was signed in, so a screen parked for the landing must not wait. */
export const UNSIGNED_OUTCOMES: ReadonlySet<LoginOutcome> = new Set<LoginOutcome>([
  LoginOutcome.Blocked, LoginOutcome.Failed, LoginOutcome.Gesture,
])
