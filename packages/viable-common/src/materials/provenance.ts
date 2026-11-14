import { MaterialLinkIntent } from './consts.js'
import type { MaterialIndexEntry, MaterialLinkDetails, ProjectMaterialRecord } from './types.js'

/**
 * Where a fetched file came from — `details.link` of its row or index entry, or `undefined` for an
 * uploaded file. Tolerant: a link without its `url`, `linkId`, a known `intent` or a boolean `own`
 * reads as none (a hand-edited index must not make an upload look fetched); mistyped optionals and
 * unknown keys are dropped.
 */
export const materialLinkOf = (entry: ProjectMaterialRecord | MaterialIndexEntry): MaterialLinkDetails | undefined => {
  const link: unknown = entry.details?.link
  if (typeof link !== 'object' || link === null || Array.isArray(link)) return undefined
  const { url, linkId, intent, own, primaryDesign, completes } = link as Record<string, unknown>
  if (typeof url !== 'string' || url === '' || typeof linkId !== 'string' || linkId === '' || typeof own !== 'boolean'
    || !Object.values(MaterialLinkIntent).includes(intent as MaterialLinkIntent)) return undefined

  return {
    url, linkId, intent: intent as MaterialLinkIntent, own,
    ...(typeof primaryDesign === 'boolean' ? { primaryDesign } : {}),
    ...(typeof completes === 'string' && completes !== '' ? { completes } : {}),
  }
}
