import type { UploadSession } from '@owlmeans/upload'
import type { UploadSessionState } from './types.js'

/** The session as a caller may see it — without its scope, owner, reservations and receiver refs. */
export const uploadSessionView = (state: UploadSessionState): UploadSession => ({
  id: state.id,
  status: state.status,
  policy: state.policy,
  files: state.files,
  totals: state.totals,
  createdAt: state.createdAt,
  updatedAt: state.updatedAt,
  ...(state.sealedAt != null ? { sealedAt: state.sealedAt } : {}),
  ...(state.abortedAt != null ? { abortedAt: state.abortedAt } : {}),
})
