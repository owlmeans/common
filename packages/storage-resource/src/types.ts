import type { Resource, ResourceRecord } from '@owlmeans/resource'
import type { StoredFileFormat } from '@owlmeans/storage-common'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { Readable } from 'stream'

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
