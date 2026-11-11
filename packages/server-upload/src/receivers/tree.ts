import { transferHelper } from '@owlmeans/file-streams'
import type { TreeSink } from '@owlmeans/file-streams'
import type { UploadReceiver } from '../types.js'
import type { TreeReceiverOptions, UploadTreeOf } from './types.js'

/**
 * Accepted files written into a tree — a directory (`createDirectorySink`), an S3 prefix
 * (`createS3Bucket(…).tree(prefix)`), a workspace scope — at their own paths, folders kept.
 */
export const treeReceiver = (tree: TreeSink | UploadTreeOf, options: TreeReceiverOptions = {}): UploadReceiver => {
  const treeOf: UploadTreeOf = typeof tree === 'function' ? tree : () => tree
  const copier = options.transfer ?? transferHelper

  return {
    receive: async (session, file, source) => {
      const copied = await copier.copy(source, treeOf(session).entry(file.path), {
        verify: false, limits: { maxBytes: session.policy.maxFileBytes },
      })
      return { ref: copied.sink.location }
    },
    ...(options.remove != null ? { remove: options.remove } : {}),
  }
}
