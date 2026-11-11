export interface NameUtils {
  /** The file name a `Content-Disposition` header carries (`filename*` per RFC 5987 first), sanitized. */
  fromDisposition: (header: string | undefined) => string | undefined
  /** The last path segment of a URL, decoded and sanitized. */
  fromUrl: (url: URL) => string | undefined
  /** The base name of an object key or a path, sanitized. */
  fromKey: (key: string) => string | undefined
  /** A base name safe to write: no directories, control characters, `..` or leading dots. */
  sanitize: (name: string | undefined) => string | undefined
  /** The lower-cased extension, keeping the compound ones (`tar.gz`). */
  extOf: (name: string | undefined) => string | undefined
}
