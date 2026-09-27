
export const SEPARATOR = '|||'

export const RESILENT_ERROR = 'ResilientError'

/**
 * Marks every `ResilientError` instance, whichever copy of this module built it.
 *
 * A process can hold several copies of this package (`bun --preserve-symlinks` over a linked
 * workspace resolves one package through several `node_modules` paths), and `instanceof` answers
 * for one copy only. `Symbol.for` returns the same symbol in every copy, so the brand is the
 * structural proof `ensure`, `marshal` and `instanceof` read.
 */
export const RESILIENT_BRAND: unique symbol = Symbol.for('@owlmeans/error:resilient')

/** The `globalThis` key of the converter registry every copy of this module shares. */
export const CONVERTER_REGISTRY: unique symbol = Symbol.for('@owlmeans/error:converters')

/** Marks the catch-all converter, so a second module copy does not push another one. */
export const CATCH_ALL_CONVERTER: unique symbol = Symbol.for('@owlmeans/error:catch-all')
