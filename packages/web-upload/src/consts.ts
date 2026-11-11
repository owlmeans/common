/** The library resource (`lib` namespace) every interface string of this package lives in. */
export const WEB_UPLOAD_RESOURCE = 'web-upload'

/** Where one entry of an upload queue stands. */
export enum UploadEntryStatus {
  /** Waiting to be sent; the local precheck lets it through. */
  Queued = 'queued',
  /** Being sent. */
  Uploading = 'uploading',
  /** The server accepted it. */
  Accepted = 'accepted',
  /** Refused — by the local precheck (recomputed on every change) or by the server (final). */
  Rejected = 'rejected',
  /** Not delivered after the client's retries; the next `start` sends it again. */
  Failed = 'failed',
}

/** Who rejected an entry. */
export enum UploadRejectedBy {
  /** The local precheck against the queue's policy — undone when the queue changes and it fits again. */
  Precheck = 'precheck',
  /** The server, or the client's precheck against the server session's own state — final. */
  Server = 'server',
}

/** Names never added to a queue, matched against every segment of a path: operating-system leftovers. */
export const DEFAULT_UPLOAD_IGNORE: readonly string[] = Object.freeze(['.DS_Store', 'Thumbs.db', 'desktop.ini', '__MACOSX'])

/** At most this many files are collected from one drop: a huge folder stops there instead of freezing the page. */
export const DEFAULT_COLLECT_LIMIT = 1000
