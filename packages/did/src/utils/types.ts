import type { KeyMeta } from '../types.js'

/** Wallet key paths composed from key metadata. */
export interface KeyPathUtils {
  /** Join path items with the key-path separator; an array item is joined with the prefix one. */
  toPath: (...args: (string | string[])[]) => string
  /** The derivation path of a key described by its metadata: service, entity, profile. */
  mataToPath: (meta: Partial<KeyMeta>) => string
  /** Whether a key's metadata carries every field the needle asks for (`name` is ignored). */
  matchMeta: (haystack: KeyMeta, needle: Partial<KeyMeta>) => boolean
}
