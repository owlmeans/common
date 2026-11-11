import { BaseMessage, type MessageFieldWithRole } from '@langchain/core/messages'
import { MEDIA_IMAGE_TYPES, MEDIA_LIMITS, MediaKind } from '@owlmeans/llm-common'
import type { MediaNeeds, MediaRequestLimits } from '@owlmeans/llm-common'
import { logger } from '@owlmeans/log'
import { LlmMediaLimitError, LlmMediaTypeError, LlmMediaUnsupportedError } from '../errors.js'
import { DEFAULT_DOCUMENT_NAME } from '../helpers/media/consts.js'
import { bytesUtils } from './bytes.js'
import { AUDIO_BLOCK_TYPES, FILE_BLOCK_TYPES, IMAGE_BLOCK_TYPES, TEXT_DOCUMENT_SOURCES } from './media/consts.js'
import type { BinaryPayload, MediaUtils } from './media/types.js'

const log = logger('llm')

const recordOf = (block: unknown): Record<string, unknown> | undefined =>
  typeof block === 'object' && block !== null && !Array.isArray(block) ? block as Record<string, unknown> : undefined

const kindOfMime = (mime: string): MediaKind => mime === 'application/pdf'
  ? MediaKind.Document
  : mime.startsWith('image/') ? MediaKind.Image
    : mime.startsWith('audio/') ? MediaKind.Audio
      : mime.startsWith('video/') ? MediaKind.Video
        : MediaKind.File

/** `data:<mime>;base64,<payload>` → its parts; anything else (a URL, a non-base64 data URL) → `undefined`. */
const parseDataUrl = (url: unknown): { mime: string, base64: string } | undefined => {
  if (typeof url !== 'string' || !url.startsWith('data:')) return undefined
  const comma = url.indexOf(',')
  const header = comma > 0 ? url.slice(5, comma) : ''
  if (!header.endsWith(';base64')) return undefined
  return { mime: header.slice(0, -';base64'.length).toLowerCase() || 'application/octet-stream', base64: url.slice(comma + 1) }
}

export const createMediaUtils = (): MediaUtils => {
  const mimeOf = (record: Record<string, unknown>): string | undefined => {
    for (const value of [record.mimeType, record.mime_type, recordOf(record.source)?.media_type]) {
      if (typeof value === 'string' && value !== '') return value.toLowerCase()
    }
    const file = recordOf(record.file)
    return parseDataUrl(record.file_data ?? file?.file_data)?.mime
      ?? (/\.pdf$/i.test(String(record.filename ?? file?.filename ?? '')) ? 'application/pdf' : undefined)
  }

  const kindOf: MediaUtils['kindOf'] = block => {
    const record = recordOf(block)
    const type = typeof record?.type === 'string' ? record.type : undefined
    if (record == null || type == null) return undefined
    if (IMAGE_BLOCK_TYPES.has(type)) return MediaKind.Image
    if (AUDIO_BLOCK_TYPES.has(type)) return MediaKind.Audio
    if (type === 'video') return MediaKind.Video
    if (type === 'document') {
      const source = recordOf(record.source)?.type
      return typeof source === 'string' && TEXT_DOCUMENT_SOURCES.has(source) ? undefined : MediaKind.Document
    }
    if (FILE_BLOCK_TYPES.has(type)) {
      const mime = mimeOf(record)
      return mime != null ? kindOfMime(mime) : MediaKind.Document
    }
    return undefined
  }

  const binaryOf: MediaUtils['binaryOf'] = block => {
    const record = recordOf(block)
    const kind = kindOf(block)
    if (record == null || kind == null) return undefined
    const payload = (base64: unknown, mime: string | undefined): BinaryPayload | undefined => {
      if (base64 instanceof Uint8Array) return { kind, mime: mime ?? 'application/octet-stream', bytes: base64 }
      if (typeof base64 !== 'string' || base64 === '') return undefined
      const url = parseDataUrl(base64)
      return url != null
        ? { kind, mime: mime ?? url.mime, base64: url.base64 }
        : { kind, mime: mime ?? 'application/octet-stream', base64 }
    }
    const mime = mimeOf(record)
    // langchain standard (`data`), its deprecated data blocks (`source_type: 'base64'`) and Anthropic (`source.data`).
    if (record.data != null && (record.source_type == null || record.source_type === 'base64')) return payload(record.data, mime)
    const source = recordOf(record.source)
    if (source?.type === 'base64') return payload(source.data, mime)
    // OpenAI: `image_url` (chat, a string or `{ url }`), `input_image`, `file.file_data`, `file_data`, `input_audio.data`.
    const imageUrl = typeof record.image_url === 'string' ? record.image_url : recordOf(record.image_url)?.url
    const fileData = record.file_data ?? recordOf(record.file)?.file_data
    for (const url of [imageUrl, fileData]) {
      const parsed = parseDataUrl(url)
      if (parsed != null) return { kind, mime: mime ?? parsed.mime, base64: parsed.base64 }
    }
    const audio = recordOf(record.input_audio)
    if (typeof audio?.data === 'string') return payload(audio.data, `audio/${String(audio.format ?? 'wav')}`)
    return undefined
  }

  const neutralOf: MediaUtils['neutralOf'] = block => {
    const record = recordOf(block)
    if (record == null || (record.type !== 'image' && record.type !== 'file')) return undefined
    if ('source' in record || 'source_type' in record || typeof record.mimeType !== 'string') return undefined
    const data = record.data instanceof Uint8Array ? bytesUtils.toBase64(record.data) : record.data
    if (typeof data !== 'string' || data === '') return undefined
    const metadata = recordOf(record.metadata) ?? {}
    const bytes = typeof metadata.bytes === 'number' ? metadata.bytes : bytesUtils.base64Size(data)
    const mimeType = record.mimeType.toLowerCase()

    return record.type === 'image'
      ? { type: 'image', mimeType, data, metadata: { ...metadata, bytes } }
      : {
        type: 'file', mimeType, data,
        metadata: { ...metadata, bytes, filename: typeof metadata.filename === 'string' && metadata.filename !== '' ? metadata.filename : DEFAULT_DOCUMENT_NAME },
      }
  }

  const payloadsOf = (content: unknown, found: BinaryPayload[] = []): BinaryPayload[] => {
    if (!Array.isArray(content)) return found
    for (const block of content) {
      const binary = binaryOf(block)
      if (binary != null) {
        found.push(binary)
      } else {
        payloadsOf(recordOf(block)?.content, found)
      }
    }
    return found
  }

  const hasBinary: MediaUtils['hasBinary'] = content => Array.isArray(content) && content.some(block =>
    binaryOf(block) != null || hasBinary(recordOf(block)?.content))

  const sizeOf = (payload: BinaryPayload): number =>
    payload.bytes != null ? payload.bytes.length : bytesUtils.base64Size(payload.base64 ?? '')

  const placeholderOf: MediaUtils['placeholderOf'] = payload => ({
    type: payload.kind,
    mime: payload.mime,
    bytes: sizeOf(payload),
    sha256: bytesUtils.sha256(payload.bytes ?? payload.base64 ?? ''),
  })

  const redactContent = <T>(content: T): T => {
    if (!Array.isArray(content)) return content
    let changed = false
    const redacted = content.map(block => {
      const binary = binaryOf(block)
      if (binary != null) {
        changed = true
        return placeholderOf(binary)
      }
      const nested = recordOf(block)?.content
      const inner = redactContent(nested)
      if (inner !== nested) {
        changed = true
        return { ...(block as Record<string, unknown>), content: inner }
      }
      return block
    })
    return (changed ? redacted : content) as T
  }

  const redactMessage: MediaUtils['redactMessage'] = message => {
    const record = recordOf(message)
    if (record == null) return message
    const content = redactContent(record.content)
    if (content === record.content) return message
    if (message instanceof BaseMessage) {
      const json = message.toJSON() as unknown as Record<string, unknown>
      const kwargs = recordOf(json.kwargs)
      return kwargs != null ? { ...json, kwargs: { ...kwargs, content } } : { type: message.getType(), content }
    }
    return { ...record, content }
  }

  const needsOf: MediaUtils['needsOf'] = messages => {
    const needs: MediaNeeds = { vision: false, documents: false }
    const visit = (content: unknown): void => {
      if (!Array.isArray(content)) return
      for (const block of content) {
        const kind = kindOf(block)
        if (kind === MediaKind.Image) needs.vision = true
        else if (kind === MediaKind.Document || kind === MediaKind.File) needs.documents = true
        else visit(recordOf(block)?.content)
      }
    }
    messages.forEach(message => visit(message.content))
    return needs
  }

  const ladderFor: MediaUtils['ladderFor'] = (rungs, needs) => {
    if (!needs.vision && !needs.documents) return rungs
    const usable = rungs.filter(rung => (!needs.vision || rung.config.vision === true)
      && (!needs.documents || rung.config.documents === true))
    const wanted = [needs.vision ? 'vision' : '', needs.documents ? 'documents' : ''].filter(Boolean).join('+')
    if (usable.length === 0) {
      throw new LlmMediaUnsupportedError(`${wanted}:${rungs.map(rung => rung.config.model ?? rung.config.alias ?? '?').join(',')}`)
    }
    if (usable.length < rungs.length) {
      log.debug('Media call skips rungs that do not accept it', {
        needs: wanted, skipped: rungs.filter(rung => !usable.includes(rung)).map(rung => rung.config.model),
      })
    }
    return usable
  }

  const refuseOver = (what: string, limit: number | undefined, actual: number): void => {
    if (limit == null || actual <= limit) return
    const error = new LlmMediaLimitError(`${what}:${actual}>${limit}`)
    error.limit = limit
    error.actual = actual
    throw error
  }

  const check = (messages: readonly MessageFieldWithRole[], limits: MediaRequestLimits | undefined): void => {
    let images = 0
    let total = 0
    let documents = 0
    for (const message of messages) {
      for (const payload of payloadsOf(message.content)) {
        const size = sizeOf(payload)
        total += size
        if (payload.kind === MediaKind.Image) {
          images++
          if (!MEDIA_IMAGE_TYPES.includes(payload.mime)) throw new LlmMediaTypeError(`image:${payload.mime}`)
          refuseOver('image-bytes', MEDIA_LIMITS.imageBytes, size)
        } else if (payload.kind === MediaKind.Document) {
          documents += size
          refuseOver('document-bytes', MEDIA_LIMITS.documentBytes, size)
        }
      }
    }
    refuseOver('request-images', limits?.images, images)
    refuseOver('request-document-bytes', limits?.documentBytes, documents)
    refuseOver('request-media-bytes', limits?.mediaBytes, total)
  }

  const render: MediaUtils['render'] = (messages, plugin, config) => {
    for (const message of messages) {
      const blocks = message.content
      if (!Array.isArray(blocks) || !blocks.some(block => neutralOf(block) != null)) continue
      message.content = blocks.map(block => {
        const part = neutralOf(block)
        return part != null ? plugin?.media?.(part, config) ?? part : block
      }) as typeof message.content
    }
    check(messages, plugin?.mediaLimits?.(config))
  }

  return {
    kindOf, binaryOf, neutralOf, hasBinary, placeholderOf, redactContent, redactMessage, needsOf, ladderFor, render,
  }
}

export const mediaUtils = createMediaUtils()
