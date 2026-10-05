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

/** The same English fallback a document's `i18nKey` translates to when nothing else names it. */
export const DEFAULT_LABEL: Record<string, string> = {
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
  billing: 'Billing Terms',
  product: '{{product}} Product Terms',
}
