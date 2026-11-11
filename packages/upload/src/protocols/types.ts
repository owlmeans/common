import type { BinaryBody, EntrypointProtocol, EntrypointTree, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { RouteParent } from '@owlmeans/route'
import type {
  UploadFileQuery, UploadFileResult, UploadOpenRequest, UploadSession, UploadSessionParams,
} from '../types.js'

export interface UploadProtocolOptions {
  /** The alias prefix of every route (`<alias>:file` …). Default `upload`; two trees in one context need two. */
  alias?: string
  /** The route this tree mounts under — its guards and gate are inherited. */
  parent?: RouteParent
  /** The segment the tree contributes under `parent` (or at the root), e.g. `/uploads`. */
  path: string
  /** The service the routes answer on (a remote service a client or a forwarding server calls). */
  service?: string
  /** The route parameter naming the session — an application may name it after its own id (`project`). Default `session`. */
  sessionParam?: string
  /** Guards of a tree without a `parent`; a tree with a parent inherits the parent's. */
  guards?: string | readonly string[]
  /** A gate of a tree without a `parent`. */
  gate?: { alias: string, params?: string | readonly string[] }
  /** The route's ceiling on one file's bytes — 413 past it, before the body is read when the length is declared. */
  maxFileBytes: number
  /** Content types the file route accepts. Default `application/octet-stream` (the declared type travels in the query). */
  types?: string[]
}

/**
 * The upload surface, mountable under any parent. An application binds the members it serves — all
 * of them, or only `file` when it opens sessions server-side:
 *
 * | Member | Route |
 * |---|---|
 * | `open` | POST `<path>` |
 * | `state` | GET `<path>/:session` |
 * | `file` | PUT `<path>/:session/file?path=…&size=…&type=…`, raw body (`streamBody`) |
 * | `remove` | DELETE `<path>/:session/file/:file` |
 * | `seal` | POST `<path>/:session/seal` |
 * | `abort` | POST `<path>/:session/abort` |
 */
export interface UploadProtocols extends EntrypointTree {
  readonly base: EntrypointProtocol<OpenRequest, OpenValue>
  readonly open: EntrypointProtocol<{ body: UploadOpenRequest }, UploadSession>
  readonly state: EntrypointProtocol<{ params: UploadSessionParams }, UploadSession>
  readonly file: EntrypointProtocol<{ params: UploadSessionParams, query: UploadFileQuery, body: BinaryBody }, UploadFileResult>
  readonly remove: EntrypointProtocol<{ params: UploadSessionParams }, UploadSession>
  readonly seal: EntrypointProtocol<{ params: UploadSessionParams }, UploadSession>
  readonly abort: EntrypointProtocol<{ params: UploadSessionParams }, UploadSession>
}

/** Any member of a tree that addresses one session. */
// The members that carry the session parameter — an indexed union of the tree's protocol types.
export type UploadSessionProtocol = UploadProtocols['state' | 'file' | 'remove' | 'seal' | 'abort']
