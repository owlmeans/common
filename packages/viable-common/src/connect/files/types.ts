import type { SpecCategory } from '../../ba/consts.js'
import type { MetadataListKind } from '../../metadata/consts.js'

/** One file of a cloud target's tree, addressed by its path relative to the project root. */
export interface ConnectFileQuery {
  path: string
}

/** A file read from a cloud target. */
export interface ConnectFileContent {
  path: string
  content: string
}

/** A whole-file write: the content replaces whatever the file held. */
export interface ConnectFileSaveBody {
  path: string
  content: string
}

/**
 * What a write or a delete did. The platform rebuilds the preview after either; a build that failed
 * leaves the last good preview serving and says why on `buildWarning` — the file change itself stands.
 */
export interface ConnectFileWritten {
  path: string
  buildWarning?: string
}

/**
 * Which of the project's metadata documents to list: `stories` (the story documents), `meta` (the
 * specifications beside the sources, narrowed by `category`) or `all` (everything under `docs/` and
 * `.agents/` plus the specifications beside the sources).
 */
export interface ConnectFileMetaQuery {
  kind: MetadataListKind
  category?: SpecCategory
}
