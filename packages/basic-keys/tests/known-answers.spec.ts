import { describe, expect, test } from 'bun:test'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { base58, base64 } from '@scure/base'
import canonicalize from 'canonicalize'
import { ed25519Plugin } from '../src/plugins/ed25519.js'

/**
 * Answers computed with @noble/hashes 1.8, @noble/curves 1.9, @noble/ciphers 1.3, @scure/base 1.2 and
 * canonicalize 2.1 — the versions this package ran before the v2 line. A round trip passes whatever the
 * library does to its bytes; these do not, so a derivation, an address or a signature that moved fails here.
 */
const enc = new TextEncoder()
const SEED = hexToBytes('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20')
const PUB = '79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664'

describe('@owlmeans/basic-keys — known answers of the crypto primitives', () => {
  test('hashes', () => {
    expect(bytesToHex(sha256(enc.encode('owlmeans')))).toBe('03321b0b5c45f6146418c0aedbf69e6c171002fbd11f13c3c7edff8b1499dbf7')
    expect(bytesToHex(sha512(enc.encode('owlmeans')))).toBe('25c101a119c1f9333f6d2d96c908dc71cc407ba30184c885179c53e7ad4b265c3dcccc1db293f2574d91b615626a91e00526b72c3d5206b8b42dd5153c3ea652')
    expect(bytesToHex(keccak_256(enc.encode('owlmeans')))).toBe('859b6703a20c79d0a3a2ab79f69cd1ed8c5268b1537ee1c433431102ee488563')
    expect(bytesToHex(hmac(sha512, enc.encode('key'), enc.encode('owlmeans')))).toBe('3e0c8942c110583b9c25f03be8e666d55c81393e61d335f486ff3cb5a9c1daf0154e68f79414a49f9c92801c05d01e21f95410fa70af37fe7d17e8108ea5b137')
  })

  test('an ed25519 key derives the same public key, address and signature', () => {
    const pub = ed25519Plugin.toPublic(SEED)
    expect(bytesToHex(pub)).toBe(PUB)
    expect(base58.encode(pub)).toBe('9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj')
    expect(base64.encode(pub)).toBe('ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=')
    expect(ed25519Plugin.toAdress(pub)).toBe('25ypesVVjyxzsRPzbQs8ejHnokbP')

    const message = enc.encode('hello owlmeans')
    const signature = ed25519Plugin.sign(message, SEED)
    expect(bytesToHex(signature)).toBe('154297b3ce7ecc748bfad553b10e564b0034e857b127a8012d6585fdd4cd2f62348c7ec2a3a9cb20e7c9f3a6681348c2af7ec7c18482ae4def296c6a4423ed0a')
    expect(ed25519Plugin.verify(message, signature, pub)).toBe(true)
    expect(ed25519.verify(signature, enc.encode('hello owlmeans!'), pub)).toBe(false)
  })

  test('a random ed25519 secret key is 32 bytes and signs verifiably', () => {
    const secret = ed25519Plugin.random()
    expect(secret.length).toBe(32)
    const message = enc.encode('fresh')
    expect(ed25519Plugin.verify(message, ed25519Plugin.sign(message, secret), ed25519Plugin.toPublic(secret))).toBe(true)
  })

  test('xchacha20-poly1305 opens a ciphertext sealed before the upgrade, and seals the same bytes', () => {
    const key = hexToBytes('fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0')
    const nonce = hexToBytes('000306090c0f1215181b1e2124272a2d303336393c3f4245')
    const sealed = 'e003dd72872ec24f237d31da2ec1f62c870582997ad3c5002b0775362bb8'
    expect(new TextDecoder().decode(xchacha20poly1305(key, nonce).decrypt(hexToBytes(sealed)))).toBe('secret payload')
    expect(bytesToHex(xchacha20poly1305(key, nonce).encrypt(enc.encode('secret payload')))).toBe(sealed)
  })

  test('canonical JSON keeps its key order, escapes and unicode', () => {
    expect(canonicalize({ b: [3, { z: 1, a: 'é' }], a: 1, n: null, u: 'ü ' })).toBe('{"a":1,"b":[3,{"a":"é","z":1}],"n":null,"u":"ü "}')
  })

  test('canonical JSON drops undefined properties, nulls undefined array items and serializes dates and numbers as before', () => {
    expect(canonicalize({ a: 1, b: undefined, c: [1, undefined, 3] })).toBe('{"a":1,"c":[1,null,3]}')
    expect(canonicalize({ z: { y: undefined, x: 1 } })).toBe('{"z":{"x":1}}')
    expect(canonicalize({ d: new Date(0) })).toBe('{"d":"1970-01-01T00:00:00.000Z"}')
    expect(canonicalize({ n: [1e21, 1e-7, -0, 0.1] })).toBe('{"n":[1e+21,1e-7,0,0.1]}')
  })
})
