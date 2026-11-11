import { sha256 as sha256Of } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { BASE64_PATTERN, DIGEST_MEMO_SIZE } from './bytes/consts.js'
import type { BytesUtils, NativeBase64 } from './bytes/types.js'

export const createBytesUtils = (): BytesUtils => {
  const digests = new Map<string, string>()

  const fromBase64 = (base64: string): Uint8Array | undefined => {
    const clean = base64.replace(/\s+/g, '')
    if (clean.length % 4 === 1 || !BASE64_PATTERN.test(clean)) {
      return undefined
    }
    const native = (Uint8Array as unknown as NativeBase64).fromBase64
    if (native != null) {
      try {
        return native.call(Uint8Array, clean)
      } catch {
        return undefined
      }
    }
    const binary = atob(clean)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }

    return bytes
  }

  const toBase64 = (bytes: Uint8Array): string => {
    const native = (bytes as unknown as { toBase64?: () => string }).toBase64
    if (typeof native === 'function') {
      return native.call(bytes)
    }
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }

    return btoa(binary)
  }

  const base64Size = (base64: string): number => {
    const clean = base64.replace(/\s+/g, '')
    const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0

    return Math.max(0, Math.floor(clean.length * 3 / 4) - padding)
  }

  const sha256 = (data: string | Uint8Array): string => {
    if (typeof data !== 'string') {
      return bytesToHex(sha256Of(data))
    }
    const known = digests.get(data)
    if (known != null) {
      return known
    }
    const digest = bytesToHex(sha256Of(fromBase64(data) ?? new TextEncoder().encode(data)))
    digests.set(data, digest)
    if (digests.size > DIGEST_MEMO_SIZE) {
      digests.delete(digests.keys().next().value!)
    }

    return digest
  }

  return { fromBase64, toBase64, base64Size, sha256 }
}

export const bytesUtils = createBytesUtils()
