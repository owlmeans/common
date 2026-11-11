/** How many payload digests a trace remembers — one request is traced once per attempt. */
export const DIGEST_MEMO_SIZE = 16

/** Standard base64, whitespace already removed. */
export const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/
