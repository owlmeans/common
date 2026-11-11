import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { CallOptions } from '@owlmeans/entrypoint'
import type { TransferHelper, TreeSink } from '@owlmeans/file-streams'
import type { UploadedFile, UploadProtocols, UploadSessionParams } from '@owlmeans/upload'
import type { UploadSessionState } from '../types.js'

/** The tree a session's files go to. */
export interface UploadTreeOf {
  (session: UploadSessionState): TreeSink
}

export interface TreeReceiverOptions {
  /** A tree sink cannot delete: removal of an accepted file, when the application can (`ref` is the sink location). */
  remove?: (session: UploadSessionState, file: UploadedFile, ref?: string) => Promise<void>
  transfer?: TransferHelper
}

/** The members of another service's upload tree a forwarding receiver calls — `file`, and what it should mirror. */
export interface ForwardingProtocols extends Pick<UploadProtocols, 'file'>, Partial<Pick<UploadProtocols, 'remove' | 'seal' | 'abort'>> {}

export interface ForwardingReceiverOptions {
  /** The remote session's route params (its own session parameter) for a local session. */
  paramsOf: (session: UploadSessionState) => UploadSessionParams | Promise<UploadSessionParams>
  /** Added to every call (`timeout`, `auth`, a host). */
  call?: Omit<CallOptions, 'signal' | 'onUploadProgress' | 'onDownloadProgress'>
}

/** The context a forwarding receiver calls through — one with the remote tree bound by client entrypoints. */
export interface ForwardingContext extends BasicContext<BasicConfig> {}
