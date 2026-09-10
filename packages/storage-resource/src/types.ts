import type { BasicResource } from '@owlmeans/context'
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

/**
 * An upload and nothing else. The bucket takes a stream and hands back a URL; there is no record
 * store behind it to read, list or delete against, so the type names the one method that works
 * rather than promising a full {@link Resource} whose rest would only throw.
 */
export type StorageResource = Pick<Resource<StoredRecord>, 'create'> & BasicResource

export interface Config extends ServerConfig, StoredConfigAppend { }
export interface Context<C extends Config = Config> extends ServerContext<C> { }
