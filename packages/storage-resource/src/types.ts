import type { Resource, ResourceRecord } from '@owlmeans/resource'
import type { StoredFileFormat, StoredFileStatus } from './consts.js'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { Readable } from 'stream'

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

export interface StoredRecord extends ResourceRecord {
  url?: string
  size?: number
  prefix: string
  stream?: Readable
  format?: StoredFileFormat
  type?: string,
  bytes?: Uint8Array
  base64?: string
}

export interface StoredConfigAppend {
  storageBuckets: { [key: string]: StorageConfig }
}

export interface StorageConfig {
  url: string
  apiKey: string
  basePrefix: string
}

export interface StorageResource extends Resource<StoredRecord> {
}

export interface Config extends ServerConfig, StoredConfigAppend { }
export interface Context<C extends Config = Config> extends ServerContext<C> { }
