import { JPEG_FRAME_MARKERS, PDF_HEADER_WINDOW, PDF_SIGNATURE, PNG_SIGNATURE } from './image/consts.js'
import type { ImageSize, ImageUtils } from './image/types.js'

const ascii = (bytes: Uint8Array, at: number, text: string): boolean =>
  bytes.length >= at + text.length && [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0))

const startsWith = (bytes: Uint8Array, signature: readonly number[], at: number = 0): boolean =>
  bytes.length >= at + signature.length && signature.every((byte, i) => bytes[at + i] === byte)

export const createImageUtils = (): ImageUtils => {
  const sniff = (bytes: Uint8Array): string | undefined => {
    if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
    if (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a')) return 'image/gif'
    if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return 'image/webp'
    return undefined
  }

  const u16be = (bytes: Uint8Array, at: number): number => (bytes[at]! << 8) | bytes[at + 1]!
  const u16le = (bytes: Uint8Array, at: number): number => bytes[at]! | (bytes[at + 1]! << 8)
  const u24le = (bytes: Uint8Array, at: number): number => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)
  const u32be = (bytes: Uint8Array, at: number): number =>
    ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!

  const jpegSize = (bytes: Uint8Array): ImageSize | undefined => {
    let at = 2
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return undefined
      const marker = bytes[at + 1]!
      if (marker === 0xff) {
        at++
        continue
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        at += 2
        continue
      }
      if (JPEG_FRAME_MARKERS.has(marker)) {
        return { height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) }
      }
      at += 2 + u16be(bytes, at + 2)
    }
    return undefined
  }

  const webpSize = (bytes: Uint8Array): ImageSize | undefined => {
    if (ascii(bytes, 12, 'VP8X') && bytes.length >= 30) {
      return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) }
    }
    if (ascii(bytes, 12, 'VP8L') && bytes.length >= 25 && bytes[20] === 0x2f) {
      return {
        width: 1 + (((bytes[22]! & 0x3f) << 8) | bytes[21]!),
        height: 1 + (((bytes[24]! & 0x0f) << 10) | (bytes[23]! << 2) | ((bytes[22]! & 0xc0) >> 6)),
      }
    }
    if (ascii(bytes, 12, 'VP8 ') && bytes.length >= 30) {
      return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff }
    }
    return undefined
  }

  const sizeOf = (bytes: Uint8Array): ImageSize | undefined => {
    switch (sniff(bytes)) {
      case 'image/png':
        return bytes.length >= 24 && ascii(bytes, 12, 'IHDR') ? { width: u32be(bytes, 16), height: u32be(bytes, 20) } : undefined
      case 'image/gif':
        return bytes.length >= 10 ? { width: u16le(bytes, 6), height: u16le(bytes, 8) } : undefined
      case 'image/webp':
        return webpSize(bytes)
      case 'image/jpeg':
        return jpegSize(bytes)
      default:
        return undefined
    }
  }

  const isPdf = (bytes: Uint8Array): boolean => {
    const window = Math.min(bytes.length - PDF_SIGNATURE.length, PDF_HEADER_WINDOW)
    for (let at = 0; at <= window; at++) {
      if (startsWith(bytes, PDF_SIGNATURE, at)) return true
    }
    return false
  }

  return { sniff, sizeOf, isPdf }
}

export const imageUtils = createImageUtils()
