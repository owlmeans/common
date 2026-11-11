/** The folder under `os.tmpdir()` a workspace lives in when no root is named. */
export const DEFAULT_WORKSPACE_DIR = 'owlmeans-workspace'

/**
 * The file that makes a folder a scope. It is reserved: no entry path may contain a segment of this
 * name, listings never show it.
 */
export const WORKSPACE_SCOPE_MARKER = '.owlmeans-scope'

/** Mode of the folders a workspace creates: private to the service's user. */
export const DEFAULT_WORKSPACE_DIR_MODE = 0o700

/** Mode of the files a workspace writes. */
export const DEFAULT_WORKSPACE_FILE_MODE = 0o600
