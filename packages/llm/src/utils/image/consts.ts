/** `\x89PNG\r\n\x1a\n` */
export const PNG_SIGNATURE: readonly number[] = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** `%PDF-` */
export const PDF_SIGNATURE: readonly number[] = Object.freeze([0x25, 0x50, 0x44, 0x46, 0x2d])

/** How far into a file its `%PDF-` header may start. */
export const PDF_HEADER_WINDOW = 1024

/** JPEG markers that open a frame (SOF0–SOF15 without DHT, JPG and DAC) — they carry the size. */
export const JPEG_FRAME_MARKERS: ReadonlySet<number> = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])
