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

/**
 * One `cfg.storageBuckets` entry. A legacy entry names only `url`, `apiKey` and `basePrefix`; the
 * optional fields address any S3-compatible store (MinIO, path-style, another region) without
 * changing how a legacy entry resolves.
 */
export interface StorageConfig {
  /**
   * `<bucket>.<endpoint-host>` — no scheme, no path: the first dot-label is the bucket, the rest the
   * endpoint (`https://<rest>`), and `https://<url>` is the public base of every object. Optional
   * when `endpoint` and `bucket` are both set.
   */
  url?: string
  /** `<keyId>:<secret>`, split at the first colon. */
  apiKey: string
  /** Prepended to every key: an object lands at `<basePrefix>/<prefix>`. */
  basePrefix: string
  /** Endpoint URL with its scheme (`http://127.0.0.1:9000`); wins over the endpoint read from `url`. */
  endpoint?: string
  /** Bucket name; wins over the first label of `url`. */
  bucket?: string
  /** Signing region. Default `eu-central-1`. */
  region?: string
  /** Path-style addressing (`<endpoint>/<bucket>/<key>`), as MinIO and most S3-compatible stores need. */
  forcePathStyle?: boolean
  /** Canned ACL sent with every upload. Default `public-read`; `false` sends none. */
  acl?: string | false
  /** Public base URL objects answer on; derived from `url` (or the endpoint) when absent. */
  publicUrl?: string
}

/**
 * An upload and nothing else. The bucket takes a stream and hands back a URL; there is no record
 * store behind it to read, list or delete against, so the type names the one method that works
 * rather than promising a full {@link Resource} whose rest would only throw.
 */
export interface StorageResource extends Pick<Resource<StoredRecord>, 'create'>, BasicResource {}

export interface Config extends ServerConfig, StoredConfigAppend { }
export interface Context<C extends Config = Config> extends ServerContext<C> { }
