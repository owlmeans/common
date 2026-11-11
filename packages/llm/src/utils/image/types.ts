/** Pixel size of an image, read from its header. */
export interface ImageSize {
  width: number
  height: number
}

/** What an image's own bytes say about it. Library-private. */
export interface ImageUtils {
  /** The image type the bytes start with — png, jpeg, gif or webp — or `undefined`. */
  sniff: (bytes: Uint8Array) => string | undefined
  /** Width and height from the header of a png, jpeg, gif or webp; `undefined` when unreadable. */
  sizeOf: (bytes: Uint8Array) => ImageSize | undefined
  /** Whether the bytes are a PDF (`%PDF-` within the first KiB, as readers accept it). */
  isPdf: (bytes: Uint8Array) => boolean
}
