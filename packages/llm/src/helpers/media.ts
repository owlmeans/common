import { MEDIA_DOCUMENT_TYPES, MEDIA_IMAGE_TYPES, MEDIA_LIMITS } from '@owlmeans/llm-common'
import type { MediaLimits } from '@owlmeans/llm-common'
import { LlmMediaLimitError, LlmMediaTypeError } from '../errors.js'
import { llmPluginRegistry } from '../plugins/registry.js'
import { bytesUtils } from '../utils/bytes.js'
import { configUtils } from '../utils/config.js'
import { imageUtils } from '../utils/image.js'
import { mediaUtils } from '../utils/media.js'
import { messageUtils } from '../utils/messages.js'
import { DEFAULT_DOCUMENT_NAME, IMAGE_TYPE_ALIASES } from './media/consts.js'
import type { DocumentOptions, DocumentPart, ImagePart, MediaData, MediaHelper } from './media/types.js'

/**
 * Content parts from bytes, checked before they exist. `limits` narrows the per-part limits for one
 * deployment; it never widens them past what every built-in provider accepts (`MEDIA_LIMITS`).
 */
export const createMediaHelper = (limits: Partial<MediaLimits> = {}): MediaHelper => {
  const bounds: Readonly<MediaLimits> = Object.freeze({
    imageBytes: Math.min(limits.imageBytes ?? MEDIA_LIMITS.imageBytes, MEDIA_LIMITS.imageBytes),
    imageSide: Math.min(limits.imageSide ?? MEDIA_LIMITS.imageSide, MEDIA_LIMITS.imageSide),
    documentBytes: Math.min(limits.documentBytes ?? MEDIA_LIMITS.documentBytes, MEDIA_LIMITS.documentBytes),
  })

  /** Bytes and base64 of whatever form the data came in. */
  const decode = (data: MediaData, what: string): { bytes: Uint8Array, base64: string } => {
    if (typeof data === 'string') {
      const comma = data.startsWith('data:') ? data.indexOf(',') : -1
      const base64 = (comma >= 0 ? data.slice(comma + 1) : data).replace(/\s+/g, '')
      const bytes = bytesUtils.fromBase64(base64)
      if (bytes == null || bytes.length === 0) throw new LlmMediaTypeError(`${what}:not-base64`)
      return { bytes, base64 }
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    return { bytes, base64: bytesUtils.toBase64(bytes) }
  }

  const refuseOver = (what: string, limit: number, actual: number): void => {
    if (actual <= limit) return
    const error = new LlmMediaLimitError(`${what}:${actual}>${limit}`)
    error.limit = limit
    error.actual = actual
    throw error
  }

  const image = (data: MediaData, mime: string): ImagePart => {
    const declared = mime.trim().toLowerCase()
    const type = IMAGE_TYPE_ALIASES[declared] ?? declared
    if (!MEDIA_IMAGE_TYPES.includes(type)) throw new LlmMediaTypeError(`image:${mime}`)
    const { bytes, base64 } = decode(data, 'image')
    const sniffed = imageUtils.sniff(bytes)
    if (sniffed !== type) throw new LlmMediaTypeError(`image:mismatch:${type}:${sniffed ?? 'unknown'}`)
    refuseOver('image-bytes', bounds.imageBytes, bytes.length)
    const size = imageUtils.sizeOf(bytes)
    if (size != null) refuseOver('image-side', bounds.imageSide, Math.max(size.width, size.height))

    return {
      type: 'image', mimeType: type, data: base64,
      metadata: { bytes: bytes.length, ...(size != null ? { width: size.width, height: size.height } : {}) },
    }
  }

  const document = (data: MediaData, options: DocumentOptions = {}): DocumentPart => {
    const type = (options.mime ?? MEDIA_DOCUMENT_TYPES[0]!).trim().toLowerCase()
    if (!MEDIA_DOCUMENT_TYPES.includes(type)) throw new LlmMediaTypeError(`document:${options.mime}`)
    const { bytes, base64 } = decode(data, 'document')
    if (!imageUtils.isPdf(bytes)) throw new LlmMediaTypeError('document:not-pdf')
    refuseOver('document-bytes', bounds.documentBytes, bytes.length)
    const filename = options.name?.split(/[\\/]/).pop()?.trim() || DEFAULT_DOCUMENT_NAME

    return { type: 'file', mimeType: type, data: base64, metadata: { filename, bytes: bytes.length } }
  }

  return {
    image,
    document,
    text: text => ({ type: 'text', text }),
    isMedia: (block): block is ImagePart | DocumentPart => mediaUtils.neutralOf(block) != null,
    redact: content => mediaUtils.redactContent(content),
    render: (messages, model) => {
      const copies = messages.map(messageUtils.copy)
      mediaUtils.render(copies, llmPluginRegistry.resolveFor(model), configUtils.readConfig(model))
      return copies
    },
    limits: bounds,
  }
}

export const mediaHelper = createMediaHelper()
