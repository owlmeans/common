/** How a bucket is addressed: in the host (`bucket.s3.amazonaws.com`) or in the path (`host/bucket`). */
export type S3AddressingStyle = 'virtual' | 'path' // closed pair of S3 addressing styles

export interface S3SourceOptions {
  /** The origin `s3://` links are read from. Default AWS (`https://s3.amazonaws.com`, virtual-hosted). */
  endpoint?: string
  /** Path-style for `endpoint`. Default `true` when an `endpoint` is given. */
  pathStyle?: boolean
  /**
   * S3-compatible origins recognised from the URL alone (path-style). Any other S3-compatible
   * endpoint is recognised from its answer — a listing, an S3 error document, `x-amz-*` headers.
   */
  endpoints?: string[]
  /** Keys asked for per listing page (≤ 1000). Default 1000. */
  pageSize?: number
  /** Listing pages read at most. Default 50. */
  maxPages?: number
}

/** A bucket and a key (or prefix), with the endpoint that serves them. */
export interface S3Location {
  /** The endpoint's origin without the bucket: `https://s3.us-east-1.amazonaws.com`, `https://s3.example.com`. */
  endpoint: string
  bucket: string
  /** The object key, or the prefix (`''` for the whole bucket); not URL-encoded. */
  key: string
  style: S3AddressingStyle
  region?: string
  /** The link was a listing (`?list-type=2&prefix=…`): `key` is a prefix even without a trailing `/`. */
  listing: boolean
}

/** S3 URLs read and built. */
export interface S3UrlHelper {
  /**
   * `s3://bucket/key`, AWS virtual-hosted (`bucket.s3[.-]region.amazonaws.com/key`), AWS path-style
   * (`s3[.-]region.amazonaws.com/bucket/key`) and the configured endpoints — `undefined` for anything
   * else, a website endpoint, or a presigned URL (that is a plain GET).
   */
  parse: (url: string) => S3Location | undefined
  /** Any http(s) URL read path-style — the first segment the bucket — for an endpoint recognised from its answer. */
  generic: (url: string) => S3Location | undefined
  /** The URL of one object. */
  objectUrl: (location: S3Location, key: string) => string
  /** A ListObjectsV2 request under `prefix`. */
  listUrl: (location: S3Location, prefix: string, page?: { token?: string, maxKeys?: number }) => string
}

export interface S3ListedObject {
  key: string
  size?: number
}

/** One ListObjectsV2 page. */
export interface S3Listing {
  bucket?: string
  objects: S3ListedObject[]
  truncated: boolean
  /** `NextContinuationToken`. */
  token?: string
}

export interface S3ErrorDocument {
  code: string
  message?: string
}

/** The two S3 XML documents the source reads — by pattern over a fixed schema, no entity expansion. */
export interface S3XmlHelper {
  listing: (xml: string) => S3Listing | undefined
  error: (xml: string) => S3ErrorDocument | undefined
}
