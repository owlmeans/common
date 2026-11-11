export interface SafeNameOptions {
  /**
   * The extension the name ends in — the detected type's canonical one (`jpg`), replacing whatever
   * the reported name carried. Default: the reported name's own extension, lower-cased.
   */
  ext?: string
  /** The longest result, extension included. Default 100. */
  maxLength?: number
  /** The stem used when nothing of the reported name is left. Default `file`. */
  fallback?: string
}

/** File names a device or an origin reported, made safe to store, mail or show. */
export interface FileNameHelper {
  /**
   * The base name of `name` (directories dropped), NFC-normalized, without controls, bidi or
   * zero-width characters, every character outside `[A-Za-z0-9_.\- ()]` as `_`, without leading or
   * trailing dots and spaces, at most `maxLength` characters, ending in `.<ext>` when there is one.
   */
  safe: (name: string, options?: SafeNameOptions) => string
  /** The lower-cased extension of a name's base, keeping the compound ones (`tar.gz`); none for `.env`. */
  extOf: (name: string | undefined) => string | undefined
}
