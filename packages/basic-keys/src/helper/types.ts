import type { KeyPairModel } from '../types.js'

/** Key models built from what a peer publishes: its public key and its address. */
export interface KeyHelper {
  /**
   * A verify-only key model of a public key, `<type>:<key>` or a bare key (ed25519 by default).
   */
  fromPubKey: (pubKey: string, type?: string) => KeyPairModel
  /** Whether an address is the one the public key derives to. */
  matchAddress: (address: string, pubKey: string) => boolean
}
