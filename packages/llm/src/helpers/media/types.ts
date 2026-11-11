import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MessageFieldWithRole } from '@langchain/core/messages'
import type { MediaLimits } from '@owlmeans/llm-common'

/** Bytes, or their base64 (a `data:` URL is accepted and its prefix dropped). */
export type MediaData = Uint8Array | ArrayBuffer | string

/**
 * A content block as langchain types one — open, so a part sits in any message's `content` array
 * (`new HumanMessage({ content: [mediaHelper.text('…'), mediaHelper.image(bytes, 'image/png')] })`).
 */
export interface ContentPart {
  type: string
  [key: string]: unknown
}

/** What {@link MediaHelper.image} measured. */
export interface ImagePartMetadata {
  /** Decoded size. */
  bytes: number
  width?: number
  height?: number
}

/** What {@link MediaHelper.document} measured. */
export interface DocumentPartMetadata {
  /** The name the provider is shown (OpenAI requires one). */
  filename: string
  /** Decoded size. */
  bytes: number
}

/**
 * A provider-neutral image part — langchain's standard image block (`type`, `mimeType`, base64
 * `data`). The provider plugin of the rung a call runs on rewrites it into that provider's own
 * spelling before the request leaves.
 */
export interface ImagePart extends ContentPart {
  type: 'image'
  mimeType: string
  /** Base64. */
  data: string
  metadata: ImagePartMetadata
}

/** A provider-neutral PDF part — langchain's standard file block; rewritten per provider like {@link ImagePart}. */
export interface DocumentPart extends ContentPart {
  type: 'file'
  mimeType: string
  /** Base64. */
  data: string
  metadata: DocumentPartMetadata
}

/** A part `MediaHelper` builds from bytes. */
export type MediaPart = ImagePart | DocumentPart

export interface TextPart extends ContentPart {
  type: 'text'
  text: string
}

export interface DocumentOptions {
  /** Only `application/pdf` is accepted; the default. */
  mime?: string
  /** Shown to the model (Anthropic `title`, OpenAI `filename`); directories are dropped. Default `document.pdf`. */
  name?: string
}

/**
 * Message content parts from bytes. Every part is checked before it exists: the type against the
 * accepted list AND the bytes' own signature, the size and (for an image) the pixel size against
 * {@link MediaHelper.limits}. A refusal is typed — `LlmMediaTypeError`, `LlmMediaLimitError` —
 * and nothing is ever resized or converted.
 */
export interface MediaHelper {
  /** An image part: png, jpeg, gif or webp (`image/jpg` is read as jpeg). */
  image: (data: MediaData, mime: string) => ImagePart
  /** A PDF part. */
  document: (data: MediaData, options?: DocumentOptions) => DocumentPart
  /** A text part, to sit beside media in one message's content. */
  text: (text: string) => TextPart
  /** Whether a content block is a neutral media part (built here, or any langchain standard image / file block with base64 data). */
  isMedia: (block: unknown) => block is MediaPart
  /**
   * The content with every binary part — in any provider's spelling — replaced by a placeholder
   * `{ type, mime, bytes, sha256 }`. What anything that RECORDS message content must store; the
   * same reference comes back when the content carries no binary part.
   */
  redact: <T>(content: T) => T
  /**
   * Copies of the messages with every neutral part in the spelling of the model's provider plugin,
   * checked against that provider's request limits — for a caller that streams a model itself (a
   * tool loop) instead of through `makeLlmModel`, which does this on every request. Call it with
   * the unbound model.
   */
  render: (messages: readonly MessageFieldWithRole[], model: BaseChatModel) => MessageFieldWithRole[]
  /** The per-part limits this helper enforces. */
  limits: Readonly<MediaLimits>
}
