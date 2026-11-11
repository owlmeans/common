/** Answers that mean "no such bucket": HeadBucket has no body, so a 404 carries only a status. */
export const MISSING_BUCKET_CODES: readonly string[] = Object.freeze(['NotFound', 'NoSuchBucket'])

/** The CreateBucket refusal that means the bucket is already ours. */
export const OWNED_BUCKET_CODE = 'BucketAlreadyOwnedByYou'

/**
 * The CreateBucket refusal for a name already taken. Some S3-compatible stores (RustFS) answer it
 * for a bucket of our own created a moment earlier by a concurrent ensure, so it is checked again.
 */
export const TAKEN_BUCKET_CODE = 'BucketAlreadyExists'
