/** The low-level key and payload primitives the key models and plugins share. */
export interface KeyUtils {
  /** The 20-byte address of a public key: the tail of its keccak-256 digest. */
  toAddress: (publicKey: Uint8Array) => Uint8Array
  /** A base64-encoded key as bytes. */
  prepareKey: (key: string) => Uint8Array
  /**
   * Bytes to sign, verify or encrypt: an object is canonicalized, a string UTF-8 encoded.
   *
   * @throws {Error} `basic.keys:sign-data-type` for anything else
   */
  prepareData: (data: unknown) => Uint8Array
  /** @throws {Error} `basic.keys:unknown-type` for a key type no plugin is registered for */
  assertType: (type?: string) => void
}
