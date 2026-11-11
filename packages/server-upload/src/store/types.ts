import type { ResourceRecord } from '@owlmeans/resource'
import type { UploadSessionState } from '../types.js'

/**
 * The record a resource keeps per session: the backend mints `id`, the session is found by `key`
 * (its own id — give it a unique index), its state is one nested value (a document, a jsonb column).
 */
export interface StoredUploadSession extends ResourceRecord {
  key: string
  state: UploadSessionState
}
