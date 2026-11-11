import type { AbstractRequest, EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import type { BoundEntrypointHandler, ServerProtocolEntrypoint } from '@owlmeans/server-entrypoint'
import type { FileScope } from '@owlmeans/storage-common'
import type { UploadProtocols } from '@owlmeans/upload'

export interface UploadHandlerOptions {
  /**
   * The scope a new session's files are spooled under — from the request, server-side (the
   * organization from the authenticated entity, never from the body). Give each session its own
   * purpose (`upload-<id>`): the scope is cleaned when the session ends.
   */
  scopeOf: (request: AbstractRequest, session: { id: string }) => FileScope | Promise<FileScope>
  /**
   * Who may use a session: compared on every request, a stranger is told the session does not exist.
   * Default the organization's stable key (`makeEntityScope(request).entityKeyOf()`); `undefined` for a
   * guest (the session id is then the capability).
   */
  ownerOf?: (request: AbstractRequest) => string | undefined | Promise<string | undefined>
  /** The id of a session `open` creates — an application's own (a project id). Default a random UUID. */
  idOf?: (request: AbstractRequest) => string | undefined | Promise<string | undefined>
}

/** A member of the tree that has a handler. */
// The keys of the tree's served members — a union of literal names.
export type UploadMember = Exclude<keyof UploadProtocols, 'base'>

/** Handlers for a `makeUploadProtocols` tree, each made for the exact protocol object it is bound to. */
export interface UploadHandlers {
  open: (protocol: UploadProtocols['open']) => BoundEntrypointHandler<UploadProtocols['open']>
  state: (protocol: UploadProtocols['state']) => BoundEntrypointHandler<UploadProtocols['state']>
  file: (protocol: UploadProtocols['file']) => BoundEntrypointHandler<UploadProtocols['file']>
  remove: (protocol: UploadProtocols['remove']) => BoundEntrypointHandler<UploadProtocols['remove']>
  seal: (protocol: UploadProtocols['seal']) => BoundEntrypointHandler<UploadProtocols['seal']>
  abort: (protocol: UploadProtocols['abort']) => BoundEntrypointHandler<UploadProtocols['abort']>
  /** The base plus every member (or the ones named), bound — ready for `registerEntrypoints`. */
  serve: (protocols: UploadProtocols, members?: UploadMember[]) => Array<ServerProtocolEntrypoint<EntrypointProtocolDeclaration>>
}
