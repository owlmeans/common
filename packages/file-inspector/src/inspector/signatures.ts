import type { Detector, FileTypeResult } from 'file-type'
import type { ITokenizer } from 'strtok3'
import { PE_DLL_FLAG, PE_HEADER_LIMIT, PYC2_MAGICS, PYC3_MAGIC_RANGE, PYC_FLAGS_MAGIC } from './consts.local.js'

/**
 * The signatures file-type misses or does not split: Windows DLLs from their PE header, Python
 * bytecode, Android dex, glTF binaries of either version. It only peeks — the core detectors still
 * see the stream from its first byte when it answers nothing.
 */
export const createSignatureDetector = (): Detector => {
  const peek = async (tokenizer: ITokenizer, length: number, position?: number): Promise<Uint8Array> => {
    const buffer = new Uint8Array(length)
    const read = await tokenizer.peekBuffer(buffer, { length, mayBeLess: true, ...(position != null ? { position } : {}) })

    return buffer.subarray(0, read)
  }

  const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
    bytes.length < offset + length ? '' : String.fromCharCode(...bytes.subarray(offset, offset + length))

  const uint16 = (bytes: Uint8Array, offset: number): number => bytes[offset] | (bytes[offset + 1] << 8)

  const uint32 = (bytes: Uint8Array, offset: number): number => (uint16(bytes, offset) | (uint16(bytes, offset + 2) << 16)) >>> 0

  const portable = async (tokenizer: ITokenizer, head: Uint8Array): Promise<FileTypeResult | undefined> => {
    const offset = uint32(head, 0x3c)
    if (offset < 0x40 || offset > PE_HEADER_LIMIT || (tokenizer.fileInfo.size != null && offset + 24 > tokenizer.fileInfo.size)) {
      return undefined
    }
    const header = offset + 24 <= head.length ? head.subarray(offset, offset + 24) : await peek(tokenizer, 24, offset)
    if (ascii(header, 0, 4) !== 'PE\0\0' || header.length < 24) {
      return undefined
    }

    return (uint16(header, 22) & PE_DLL_FLAG) !== 0
      ? { ext: 'dll', mime: 'application/x-msdownload' }
      : { ext: 'exe', mime: 'application/x-msdownload' }
  }

  const pythonBytecode = (head: Uint8Array): boolean => {
    if (head.length < 8 || head[2] !== 0x0d || head[3] !== 0x0a) {
      return false
    }
    const magic = uint16(head, 0)
    if (magic >= PYC3_MAGIC_RANGE[0] && magic <= PYC3_MAGIC_RANGE[1]) {
      return magic < PYC_FLAGS_MAGIC || uint32(head, 4) <= 3
    }

    return PYC2_MAGICS.includes(magic)
  }

  const detect = async (tokenizer: ITokenizer): Promise<FileTypeResult | undefined> => {
    const head = await peek(tokenizer, 256)
    if (head.length < 4) {
      return undefined
    }
    if (head[0] === 0x4d && head[1] === 0x5a && head.length >= 0x40) {
      return await portable(tokenizer, head)
    }
    if (pythonBytecode(head)) {
      return { ext: 'pyc', mime: 'application/x-python-bytecode' }
    }
    if (ascii(head, 0, 4) === 'dex\n' && /^\d{3}$/.test(ascii(head, 4, 3)) && head[7] === 0) {
      return { ext: 'dex', mime: 'application/x-dex' }
    }
    if (ascii(head, 0, 4) === 'glTF' && head.length >= 8 && (uint32(head, 4) === 1 || uint32(head, 4) === 2)) {
      return { ext: 'glb', mime: 'model/gltf-binary' }
    }

    return undefined
  }

  return { id: 'owlmeans.signatures', detect }
}
