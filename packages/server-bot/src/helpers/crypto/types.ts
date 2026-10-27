/** Seals and opens one deployment's connection credentials. */
export interface BotSealer {
  /**
   * AES-256-GCM over the JSON of `credentials`, a fresh 96-bit IV each time, `aad` authenticated
   * (the connection's scope — a sealed string moved to another scope does not open):
   * `v1.<iv>.<tag>.<ciphertext>`, base64url.
   */
  seal: (credentials: Record<string, string>, aad: string) => string
  /** @throws {BotCredentialsUnreadable} tampered, another key, another `aad`, or not a sealed string */
  open: (sealed: string, aad: string) => Record<string, string>
}

export interface BotCryptoHelper {
  /** A sealer keyed by HKDF-SHA256(secret, 'owlmeans-bot', 'credentials') — memoized per secret. */
  sealerOf: (secret: string) => BotSealer
  /** A random URL-safe secret (base64url of `bytes` random bytes, default 32) — a hook secret. */
  randomSecret: (bytes?: number) => string
}
