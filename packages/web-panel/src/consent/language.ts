import type { ConsentOptions } from '@owlmeans/web-consent'

/**
 * @deprecated The interface language is strictly necessary storage: `@owlmeans/client-i18n` writes
 * it on every switch and reads it at every start, and `@owlmeans/consent` stores a language that
 * arrives with a link — none of it waits for a cookie decision, so there is nothing left to bind.
 *
 * Kept as a no-op (returning a no-op cleanup) only so an application written against the earlier,
 * consent-gated API — a generated target that floats to a newer release — still builds. Remove the
 * call.
 */
export const installConsentLanguage = (_opts?: ConsentOptions): (() => void) => () => undefined
