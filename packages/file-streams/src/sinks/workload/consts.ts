/** The publisher refuses a `writeBinaryFile` payload longer than this many base64 characters. */
export const WORKLOAD_MAX_BASE64_CHARS = 16 * 1024 * 1024

/** The largest file whose base64 fits the publisher's ceiling (12 MiB). */
export const WORKLOAD_MAX_FILE_BYTES = WORKLOAD_MAX_BASE64_CHARS / 4 * 3

