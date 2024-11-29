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
