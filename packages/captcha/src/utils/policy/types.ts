/** The parsing both captcha policies share: config lists and hosts as they are compared. */
export interface PolicyUtils {
  /** A comma- or space-separated config string as its entries; `''`, absent and non-strings are none. */
  listOf: (value: unknown) => string[]
  /** A host as it is compared: lowercased, without a trailing dot or a leading `*.`/`.`. */
  hostOf: (value: string) => string
  /** Whether a token's hostname equals one of `hosts` (already compared form) or is a subdomain of one. */
  hostAllowed: (hosts: string[], hostname: unknown) => boolean
}
