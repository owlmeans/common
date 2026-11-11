import type { FileKind } from '@owlmeans/file-inspector/kinds'
import type { UploadedFileStatus, UploadReason, UploadSessionStatus } from './consts.js'

/** How many files and bytes. */
export interface UploadTotals {
  files: number
  bytes: number
}

/** The three ceilings of a session, counted on the EXPANDED set (archive entries, not archives). */
export interface UploadLimits {
  /** Accepted files of a session. */
  maxFiles: number
  /** Bytes of one accepted file. */
  maxFileBytes: number
  /** Bytes of every accepted file of a session together. */
  maxTotalBytes: number
}

/** What a session accepts. */
export interface UploadPolicy extends UploadLimits {
  /** zip, tar, tar.gz and gz are unpacked and their entries handled like uploaded files. Default `true`. */
  unpackArchives: boolean
  /** Kinds refused even under an honest claim. Default `[FileKind.Executable]`. */
  refuse: FileKind[]
  /** When set, only these detected kinds are accepted. */
  allow?: FileKind[]
}

/** One file a session received — accepted, or rejected with a reason. */
export interface UploadedFile {
  id: string
  /** The normalized relative path, folders kept (`docs/brief.md`); an archive entry under the archive's folder. */
  path: string
  /** The last segment of `path`, the original name. */
  name: string
  /** Bytes received (a rejected file: declared or counted so far). */
  size: number
  /** The detected media type (the declared one when nothing was detected). */
  mime?: string
  kind?: FileKind
  /** sha256 of the accepted bytes, hex. */
  digest?: string
  status: UploadedFileStatus
  reason?: UploadReason
  /** The path of the archive this file was unpacked from. */
  from?: string
}

/** A session as every caller sees it. */
export interface UploadSession {
  id: string
  status: UploadSessionStatus
  policy: UploadPolicy
  /** Accepted and rejected files, in the order they were decided. */
  files: UploadedFile[]
  /** Accepted files only. */
  totals: UploadTotals
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
  sealedAt?: string
  abortedAt?: string
}

/** The body of `open`. */
export interface UploadOpenRequest {
  /** What the caller is about to send — refused up front (`UploadLimitError`) when it cannot fit. */
  expect?: UploadTotals
}

/** The query of `file`: the relative path (folders kept) and what the caller declares about it. */
export interface UploadFileQuery {
  path: string
  /** Declared bytes — reserved before reading when the request carries no Content-Length (a stream). */
  size?: number
  /** Declared media type; the request's own content type is the route's transport type. */
  type?: string
}

/** The answer of `file`: one entry, or every entry of an unpacked archive (or the archive, rejected). */
export interface UploadFileResult {
  files: UploadedFile[]
}

/** Route parameters of a session route — keyed by the session parameter the protocols were declared with. */
export interface UploadSessionParams {
  [param: string]: string
}

/** The limits a path is held to. */
export interface UploadPathLimits {
  maxPathBytes: number
  maxSegmentBytes: number
  maxSegments: number
}
