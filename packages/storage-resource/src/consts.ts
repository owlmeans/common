
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

export const DEFAULT_ALIAS = 's3-storage'
