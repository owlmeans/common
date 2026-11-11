import type { StoredFileFormat, StoredFileStatus } from './consts.js'

export interface StoredFileMeta {
  entityId?: string
  sourceName?: string
  name?: string
  title?: string
  scopes: string[]
  mimeType: string
  alias: string
  status: StoredFileStatus
}

export interface StoredFileInstance {
  size: number
  alias: string
  url: string
}

export interface StoredFilePayload extends StoredFileInstance {
  format?: StoredFileFormat
  bytes?: Uint8Array
  base64?: string
}

export interface StoredFile extends StoredFileMeta {
  instances: { [key: string]: StoredFileInstance }
}

export interface StoredFileWithData extends StoredFileMeta {
  format?: StoredFileFormat
  instances: { [key: string]: StoredFilePayload }
}

/**
 * Where a service keeps the files of one task — on disk and in a bucket alike, nested as
 * `<organization>/<project>/<purpose>` (or `<organization>/<purpose>` without a project).
 * Every field is one path segment (`FILE_SCOPE_SEGMENT_PATTERN`, at most 128 characters).
 */
export interface FileScope {
  /** The organization the files belong to — its `entitySlug` on the wire. */
  organization: string
  /** The project inside the organization, when the files belong to one (an id or a slug). */
  project?: string
  /** The task or purpose the files serve (`new-project`, `upload`). */
  purpose: string
}
