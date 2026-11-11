export enum StoredFileStatus {
  Uploaded = 'uploaded',
  ProcessingReady = 'processing-ready',
  Processed = 'processed',
  Cached = 'cached',
  Unknown = 'unknown'
}

export enum StoredFileFormat {
  Bytes = 'bytes',
  Base64 = 'base64'
}

/** The longest segment of a file scope. */
export const FILE_SCOPE_SEGMENT_MAX_LENGTH = 128

/** One file scope segment: a letter or digit, then letters, digits, `.`, `_` or `-` (never `.` or `..`). */
export const FILE_SCOPE_SEGMENT_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]*$'
