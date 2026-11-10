/** Header on a response the bridge itself produced because the upstream failed — a proxy failure. */
export const BRIDGE_ERROR_HEADER = 'x-owlmeans-proxy-error'

/** Header on a response the bridge produced because the address guard refused the target. */
export const BRIDGE_REFUSED_HEADER = 'x-owlmeans-refused'

/** Largest request head the bridge reads before giving up on a client. */
export const MAX_HEAD_BYTES = 16 * 1024

export const SOCKS_CONNECT_TIMEOUT_MS = 15_000
