
export enum IdStyle {
  Base58 = 'base58',
  Base64 = 'base64'
}

/**
 * Word-slug shape: two lowercase words joined by a hyphen, optionally carrying a numeric
 * disambiguation suffix (`brisk-otter`, `brisk-otter-2`).
 *
 * A slug generated this way is a valid DNS label and a valid Kubernetes object-name segment,
 * which is the whole point of preferring it over a random string: the same value can address a
 * host, a namespace and an OIDC client without a second sanitising pass.
 */
export const WORD_SLUG_SEPARATOR = '-'

/** Words per thesaurus. A power of two so an index costs exactly 11 unbiased bits. */
export const WORDLIST_SIZE = 2048
