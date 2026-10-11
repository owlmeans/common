import type { MnemonicOptions } from '../../types.js'

/** BIP-39 mnemonics: generation and the seed and entropy derived from them. */
export interface MnemonicHelper {
  /** A new mnemonic of `opts.size` words (12–24, default 18). @throws {SyntaxError} outside that range */
  generateMnemonic: (opts?: MnemonicOptions) => string
  /** The BIP-39 seed of a mnemonic, base64. */
  toSeed: (mnemonic: string) => string
  /** The BIP-39 seed of a mnemonic, hex. */
  toEntropy: (mnemonic: string) => string
  /** The mnemonic of hex entropy. */
  toMnemonic: (seed: string) => string
}
