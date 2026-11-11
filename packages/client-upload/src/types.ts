import type { BinaryBody } from '@owlmeans/entrypoint'

/** A body made on demand — a file stream opened per attempt, so a failed upload can be sent again. */
export interface UploadBodyFactory {
  (): BinaryBody | Promise<BinaryBody>
}

/** What an input carries: bytes, a Blob/File, a Node stream (sent once, never retried) or a factory. */
// The transport's binary shapes plus a factory of them — a union.
export type UploadBody = BinaryBody | UploadBodyFactory

/** One file to upload. */
export interface UploadInput {
  /** The relative path, folders kept (`docs/brief.md`). */
  path: string
  body: UploadBody
  /** Bytes — known from a Blob or bytes; give it for a stream or a factory, so the precheck and the reservation see it. */
  size?: number
  /** The declared media type. */
  type?: string
}
