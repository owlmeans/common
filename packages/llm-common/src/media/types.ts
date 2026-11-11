import type { MediaKind } from './consts.js'

/** Per-part media limits, in raw bytes and pixels — see `MEDIA_LIMITS`. */
export interface MediaLimits {
  /** Largest image, raw bytes. */
  imageBytes: number
  /** Longest side of an image, px. */
  imageSide: number
  /** Largest document, raw bytes. */
  documentBytes: number
}

/** Per-request media limits one provider documents. An omitted field is not limited. */
export interface MediaRequestLimits {
  /** Image parts in one request, earlier turns included. */
  images?: number
  /** Raw bytes of every binary part of one request together. */
  mediaBytes?: number
  /** Raw bytes of every document of one request together. */
  documentBytes?: number
}

/** What a call's content needs from the model that answers it. */
export interface MediaNeeds {
  /** The content carries an image. */
  vision: boolean
  /** The content carries a document. */
  documents: boolean
}

/** What one rung of a role's escalation ladder accepts. */
export interface RungCapabilities {
  /** The rung's model id, when its config names one. */
  model?: string
  provider?: string
  vision: boolean
  documents: boolean
}

/**
 * What the model a role resolved to accepts. A call carrying images (documents) is sent only to the
 * rungs that accept them — a fallback without the capability never receives media — so `vision` is
 * true when at least one rung can answer such a call; `rungs[0]` is the primary.
 */
export interface ModelCapabilities {
  vision: boolean
  documents: boolean
  /** Primary first, then every fallback. */
  rungs: RungCapabilities[]
}

/**
 * What a trace stores in place of a binary content part: never the payload, only enough to tell
 * which file it was.
 */
export interface MediaPlaceholder {
  type: MediaKind
  mime: string
  /** Size of the decoded payload. */
  bytes: number
  /** Hex SHA-256 of the decoded payload. */
  sha256: string
}
