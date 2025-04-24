import type { MnemonicOptions } from '../types.js'
import { generateMnemonic as generate, mnemonicToSeedSync, entropyToMnemonic } from '@scure/bip39'
import { hex, base64 } from '@scure/base'
import { wordlist } from '@scure/bip39/wordlists/english'

export const generateMnemonic = (opts?: MnemonicOptions): string => {
  const size = opts?.size ?? 18

  if (size < 12 || size > 24) {
    throw new SyntaxError('Mnemonic size should be between 12 and 24')
  }

  const strength = Math.round(256 * size / 24)
  return generate(wordlist as any, strength + (32 - strength % 32))
}

export const toSeed = (mnemonic: string): string =>
  base64.encode(mnemonicToSeedSync(mnemonic))

export const toEntropy = (mnemonic: string): string =>
  hex.encode(mnemonicToSeedSync(mnemonic))

export const toMnemonic = (seed: string): string =>
  entropyToMnemonic(hex.decode(seed), wordlist as any)
