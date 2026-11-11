import type { BasicResource } from '@owlmeans/context'
import type { Resource, ResourceRecord } from '@owlmeans/resource'
import type { StoredFileFormat } from '@owlmeans/storage-common'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { Readable } from 'stream'

export interface StoredRecord extends ResourceRecord {
  url?: string
  /** Exact bytes of `stream`: sent as `Content-Length`, a shorter or longer body is refused. */
  size?: number
  prefix: string
  stream?: Readable
  format?: StoredFileFormat
  /** The declared media type: verified against the bytes and stored as the object's `Content-Type`. */
  type?: string,
  /** The original file name — its extension is one more claim the bytes are verified against. */
  name?: string
  bytes?: Uint8Array
  base64?: string
}

export interface StoredConfigAppend {
  storageBuckets: { [key: string]: StorageConfig }
}

/** Client limits of one bucket entry. */
export interface StorageTimeouts {
  /** Milliseconds to establish the connection. */
  connectMs?: number
  /** Milliseconds from sending a request to its response headers, the request body included; refused past it. */
  requestMs?: number
}

/**
 * One `cfg.storageBuckets` entry. A legacy entry names only `url`, `apiKey` and `basePrefix`; the
 * optional fields address any S3-compatible store (RustFS, MinIO, path-style, another region)
 * without changing how a legacy entry resolves.
 *
 * Every string leaf may be a mounted file path (`/etc/secret/s3-key`): the server context's config
 * reader replaces a leaf starting with `/` by that file's contents before the entry is read.
 */
export interface StorageConfig {
  /**
   * `<bucket>.<endpoint-host>` — no scheme, no path: the first dot-label is the bucket, the rest the
   * endpoint (`https://<rest>`), and `https://<url>` is the public base of every object. Optional
   * when `endpoint` and `bucket` are both set.
   */
  url?: string
  /** `<keyId>:<secret>`, split at the first colon. Optional when `accessKeyId` and `secretAccessKey` are set. */
  apiKey?: string
  /** The access key id; with `secretAccessKey`, wins over `apiKey`. */
  accessKeyId?: string
  /** The secret access key; with `accessKeyId`, wins over `apiKey`. */
  secretAccessKey?: string
  /** Prepended to every key: an object lands at `<basePrefix>/<prefix>`; empty or absent — at `<prefix>`. */
  basePrefix?: string
  /** Endpoint URL with its scheme (`http://127.0.0.1:9000`); wins over the endpoint read from `url`. */
  endpoint?: string
  /** Bucket name; wins over the first label of `url`. */
  bucket?: string
  /** Signing region. Default `eu-central-1`. */
  region?: string
  /** Path-style addressing (`<endpoint>/<bucket>/<key>`), as RustFS, MinIO and most S3-compatible stores need. */
  forcePathStyle?: boolean
  /** Canned ACL sent with every upload. Default `public-read`; `false` sends none. */
  acl?: string | false
  /** Public base URL objects answer on; derived from `url` (or the endpoint) when absent. */
  publicUrl?: string
  /** Create the bucket when it is missing: once when the resource initializes, again on an upload until it succeeds. */
  ensure?: boolean
  /** The zone a created bucket is placed in. Default the region; never sent for `us-east-1`. */
  locationConstraint?: string
  /**
   * The store's admin API path (`rustfs/admin/v3`), exposed as `adminUrl` beside the endpoint. Write
   * a config literal without its leading slash — the config reader takes a leaf starting with `/`
   * for a file path.
   */
  adminPath?: string
  timeouts?: StorageTimeouts
  /** Attempts of one request, the first included. SDK default (3) when absent; an upload always makes one. */
  maxAttempts?: number
}

/**
 * An upload and nothing else. The bucket takes a stream and hands back a URL; there is no record
 * store behind it to read, list or delete against, so the type names the one method that works
 * rather than promising a full {@link Resource} whose rest would only throw.
 */
export interface StorageResource extends Pick<Resource<StoredRecord>, 'create'>, BasicResource {}

export interface Config extends ServerConfig, StoredConfigAppend { }
export interface Context<C extends Config = Config> extends ServerContext<C> { }
