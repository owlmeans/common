import type { AuthSessionSelector } from './types.js'

/** Never derive storage identity from the renameable organization slug. */
export const subjectId = ({ entityId, profileId, clientId }: AuthSessionSelector): string =>
  `subject:${entityId}:${profileId}:${clientId ?? ''}`
