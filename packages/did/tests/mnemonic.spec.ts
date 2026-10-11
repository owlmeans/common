import { describe, expect, test } from 'bun:test'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { mnemonicHelper } from '../src/utils/mnemonic.js'

/**
 * Answers computed with @scure/bip39 1.6 before the v2 line: the seed of the all-`abandon` test mnemonic is
 * the published BIP-39 vector, so a changed derivation fails here rather than as a different DID.
 */
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const SEED_HEX = '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4'

describe('@owlmeans/did — mnemonic derivation', () => {
  test('the seed of the BIP-39 test mnemonic is the published vector', () => {
    expect(mnemonicHelper.toEntropy(MNEMONIC)).toBe(SEED_HEX)
    expect(Buffer.from(mnemonicHelper.toSeed(MNEMONIC), 'base64').toString('hex')).toBe(SEED_HEX)
  })

  test('entropy turns back into the mnemonic it came from', () => {
    expect(mnemonicHelper.toMnemonic('00000000000000000000000000000000')).toBe(MNEMONIC)
  })

  test('a generated mnemonic is a valid BIP-39 length and made of words of the list', () => {
    const words = mnemonicHelper.generateMnemonic({ size: 12 }).split(' ')
    expect([12, 15, 18, 21, 24]).toContain(words.length)
    expect(words.every(word => wordlist.includes(word))).toBe(true)
  })

  test('sizes outside 12–24 are refused', () => {
    expect(() => mnemonicHelper.generateMnemonic({ size: 8 })).toThrow()
  })
})
