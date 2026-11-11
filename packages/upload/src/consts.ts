import { FileKind } from '@owlmeans/file-inspector/kinds'
import type { UploadPathLimits, UploadPolicy } from './types.js'

/** Where an upload session stands. Only an open session takes files. */
export enum UploadSessionStatus {
  Open = 'open',
  Sealed = 'sealed',
  Aborted = 'aborted',
}

/** What became of one received file. */
export enum UploadedFileStatus {
  Accepted = 'accepted',
  Rejected = 'rejected',
}

/** Why a file was rejected — the closed vocabulary every layer (server, client precheck, UI) speaks. */
export enum UploadReason {
  /** A count, per-file or total limit of the policy. */
  Limits = 'limits',
  /** The bytes are not what the name or the declared type claims. */
  TypeMismatch = 'type-mismatch',
  /** Executable content under another claim, a script under a passive one, an active PDF. */
  Dangerous = 'dangerous',
  /** A kind the policy refuses (`refuse`) or does not allow (`allow`), even under an honest claim. */
  RefusedKind = 'refused-kind',
  /** An archive that cannot be unpacked safely (traversal, bomb, broken, link entries). */
  ArchiveInvalid = 'archive-invalid',
  /** A path that is absolute, climbs out (`..`), carries control characters, is too long or too deep. */
  PathInvalid = 'path-invalid',
  /** The session already holds a file at this path (compared case-insensitively). */
  Duplicate = 'duplicate',
}

export const DEFAULT_UPLOAD_ALIAS = 'upload'

/** The route parameter naming the session unless an application names it after its own id. */
export const DEFAULT_UPLOAD_SESSION_PARAM = 'session'

/** The route parameter naming one file of a session (`remove`). */
export const UPLOAD_FILE_PARAM = 'file'

/** 50 files, 12 MiB each, 50 MiB together, archives unpacked, executables refused. */
export const DEFAULT_UPLOAD_POLICY: Readonly<UploadPolicy> = Object.freeze({
  maxFiles: 50,
  maxFileBytes: 12 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  unpackArchives: true,
  refuse: [FileKind.Executable],
})

/** The path rules — aligned with `@owlmeans/file-streams`, which writes the files where they land. */
export const UPLOAD_PATH_LIMITS: Readonly<UploadPathLimits> = Object.freeze({
  maxPathBytes: 1024,
  maxSegmentBytes: 255,
  maxSegments: 64,
})

/** The longest refused path a display form keeps. */
export const UPLOAD_DISPLAY_PATH_LENGTH = 256
