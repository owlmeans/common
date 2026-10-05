/** Identifiers read by people and machines: UUIDs and human-readable word slugs. */
export interface IdHelper {
  /** A UUID v4. */
  uuid: () => string
  /**
   * A human-readable slug: one descriptive word, one subject word — `civil-format`, `raised-earth`.
   *
   * This exists because the values it replaces are read by people. An organization slug turns up in
   * hostnames, OIDC client ids and support conversations, and a 16-character Base58 string is
   * unquotable over the phone and unrecognisable in a list. Two words out of 2048 each give 22 bits
   * of entropy — far short of a secret, and deliberately so: uniqueness here is settled by a unique
   * index and `nextSlugCandidate`, not by entropy. Never use this for anything that must be
   * unguessable (nonces, secrets, tokens) — `createIdOfLength` is that function.
   */
  generateWordSlug: () => string
  /**
   * The n-th candidate for an occupied slug: `brisk-otter`, `brisk-otter-2`, `brisk-otter-3`.
   *
   * The first attempt is the bare name — a suffix appears only once something already answers to it,
   * so the common case keeps the name it was given. Callers own the availability test (a unique
   * index, a registry claim) and walk this until one is free.
   */
  nextSlugCandidate: (base: string, attempt: number) => string
}
