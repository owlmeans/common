import type { BinaryBody } from '@owlmeans/entrypoint'
import type { UploadBody, UploadInput } from '../types.js'

/** A browser `File` as far as this package reads it (a dropzone's `path` included). */
export interface UploadFileLike extends Blob {
  readonly name: string
  readonly webkitRelativePath?: string
  /** react-dropzone's relative path (`./folder/a.png`, `/folder/a.png`). */
  readonly path?: string
}

export interface UploadInputHelper {
  /** Inputs from picked or dropped files — the folder path kept (`webkitRelativePath`, a dropzone's `path`, else the name). */
  fromFiles: (files: ArrayLike<UploadFileLike> | Iterable<UploadFileLike>) => UploadInput[]
  /** The size a body knows by itself (a Blob, bytes); `undefined` for a stream or a factory. */
  sizeOf: (body: UploadBody) => number | undefined
  /** Whether a body can be sent again (not a one-shot stream). */
  isReusable: (body: UploadBody) => boolean
  /** The body to send now — a factory is called. */
  bodyOf: (body: UploadBody) => Promise<BinaryBody>
}
