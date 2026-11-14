/** A package name split at its scope. */
export interface PackageNameParts {
  /** The scope without `@` (`types` of `@types/node`); absent for an unscoped name. */
  scope?: string
  /** The name after the scope. */
  base: string
}

export interface PackageVariantOptions {
  /** At most this many variants, most likely first. Default `PACKAGE_VARIANT_LIMIT`. */
  limit?: number
}

/**
 * Pure package-name utilities: the edit distance, normalisation and the bounded variant generator
 * registry adapters derive neighbours from. Names are compared lowercase.
 */
export interface PackageNameHelper {
  /** The name split at its scope. */
  split: (name: string) => PackageNameParts
  /** Whether the name is a well-formed package name (lowercase, URL-safe, no leading `.`/`_`/`-`). */
  isValid: (name: string) => boolean
  /** The unrestricted Damerau-Levenshtein distance: insertions, deletions, substitutions, adjacent transpositions. */
  distance: (a: string, b: string) => number
  /** The base without scope, lowercase, with every separator (`-`, `.`, `_`) removed: `@x/Lodash.Get` → `lodashget`. */
  normalise: (name: string) => string
  /** `normalise` with the common affixes dropped (a `node` prefix, a `js` suffix): `node-lodash.js` → `lodash`. */
  stem: (name: string) => string
  /** Whether two names are near: the same stem, or normalised forms within `maxDistance` edits (default 2). */
  related: (a: string, b: string, maxDistance?: number) => boolean
  /**
   * Names a mistyping or an imitation of `name` could be, most likely first, bounded: the scope
   * stripped, separator swaps, the `js`/`-js`/`.js` suffix and `node-` prefix added or dropped,
   * adjacent transpositions, deletions, then substitutions and insertions over `[a-z0-9-._]`. For a
   * scoped name the scope is edited too (swaps, transpositions, deletions). Only valid names, never
   * `name` itself, no duplicates.
   */
  variants: (name: string, options?: PackageVariantOptions) => string[]
}
