import type { MediaLimits } from './types.js'

/** What a binary content part carries — the `type` of a trace placeholder. */
export enum MediaKind {
  Image = 'image',
  /** A PDF (or another document a provider reads as pages). */
  Document = 'document',
  Audio = 'audio',
  Video = 'video',
  /** Any other binary file. */
  File = 'file',
}

/**
 * The image types every built-in provider plugin accepts (Anthropic and OpenAI document the same
 * four; an animated GIF is read by its first frame). Anything else is refused before a request.
 */
export const MEDIA_IMAGE_TYPES: readonly string[] = Object.freeze(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/** The document types a model reads as pages. */
export const MEDIA_DOCUMENT_TYPES: readonly string[] = Object.freeze(['application/pdf'])

/**
 * Per-part limits — the strictest documented by the built-in providers, so a part that passes is
 * accepted by every one of them:
 *
 * - an image of at most 10 MB base64-encoded (Anthropic API; OpenAI states no per-image size), which
 *   is 7 500 000 raw bytes, and at most 8000 px on either side (Anthropic);
 * - a PDF under 50 MB (OpenAI, per file and per request; Anthropic allows a 128 MB request).
 *
 * Checked on the raw bytes, so an upload screen can test `file.size` against the same numbers.
 */
export const MEDIA_LIMITS: Readonly<MediaLimits> = Object.freeze({
  imageBytes: 7_500_000,
  imageSide: 8000,
  documentBytes: 50_000_000,
})
