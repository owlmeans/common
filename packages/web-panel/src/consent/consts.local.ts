import type { ConsentLocale } from '@owlmeans/web-consent'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'

/**
 * The consent package carries its own locale list because it must build with no dependency on the
 * i18n package at all. This assertion is what keeps the two from drifting: a language added to the
 * framework and not to the bundle fails here, at build time, rather than as a dialog rendering
 * English to the one reader who cannot report it.
 */
export const _localeParity: readonly ConsentLocale[] = SUPPORTED_LNGS as readonly ConsentLocale[]
