export const UPLOAD_SERVICE = 'upload'

/** The folder of a scope that holds files while they are received: `<spool>/<session>/<file>`. */
export const UPLOAD_SPOOL_FOLDER = 'spool'

/** The folder of a scope archives are unpacked into: `<unpack>/<session>/<file>/…`. */
export const UPLOAD_UNPACK_FOLDER = 'unpack'

/** The workspace root under `os.tmpdir()` when the service is given none. */
export const DEFAULT_UPLOAD_WORKSPACE_ROOT = 'owlmeans-upload'

/** Rejected rows a session keeps; past it a rejection is answered but not recorded. */
export const UPLOAD_REJECTED_RECORDS = 200

/** Entries an archive may carry per file the session still allows (directories are entries too), plus a margin. */
export const UPLOAD_ARCHIVE_ENTRIES_PER_FILE = 4
export const UPLOAD_ARCHIVE_ENTRY_MARGIN = 16
