/** The name of the built-in S3 source. */
export const S3_SOURCE = 's3'

/** Where `s3://` links go unless the source is given an endpoint. */
export const DEFAULT_S3_ENDPOINT = 'https://s3.amazonaws.com'

export const DEFAULT_S3_PAGE_SIZE = 1000

export const DEFAULT_S3_MAX_PAGES = 50

/** Query parameters that make a URL presigned — it is fetched as a plain file. */
export const S3_PRESIGNED_PARAMS: readonly string[] = Object.freeze(['x-amz-signature', 'x-amz-credential', 'signature', 'awsaccesskeyid'])

/** Header name prefixes an S3-compatible server answers with. */
export const S3_HEADER_PREFIXES: readonly string[] = Object.freeze(['x-amz-', 'x-minio-', 'x-rustfs-'])
