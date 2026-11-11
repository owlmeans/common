import { supportedMimeTypes as mimeTypes } from 'file-type'

export const DEFAULT_ALIAS = 's3-storage'

export const supportedMimeTypes = [...mimeTypes]

/** Bytes of an upload's head verified before the body is streamed on. */
export const STORAGE_HEAD_BYTES = 64 * 1024
