/** Bytes and base64, the same on every runtime the package runs on. Library-private. */
export interface BytesUtils {
  /** Decode standard base64 (whitespace tolerated); `undefined` when it is not base64. */
  fromBase64: (base64: string) => Uint8Array | undefined
  toBase64: (bytes: Uint8Array) => string
  /** Bytes a base64 string decodes to, without decoding it. */
  base64Size: (base64: string) => number
  /**
   * Hex SHA-256 of the decoded payload. A base64 string is decoded first; the last few digests are
   * remembered by the string, since one request is traced once per attempt.
   */
  sha256: (data: string | Uint8Array) => string
}

/** The runtime's own codec where it has one (Bun, Node 25+, current browsers). */
export interface NativeBase64 {
  fromBase64?: (base64: string) => Uint8Array
}
