import { platformPresentation } from '../presentation/platform.js'
import { workPresentation } from '../presentation/work.js'
import { shapeHelper } from '../presentation/work/shape.js'
import type { ToolPresentation } from '../types.js'
import { LISTING_TOOLS, SESSION_STATUS_OUTPUT } from './consts.local.js'

/**
 * Everything a listing presents per tool: the declared output and presenter of the work and the
 * platform domains, `session_status`'s own (a listing reports the client, so it answers one), and
 * the listing's titles, descriptions and annotations from {@link LISTING_TOOLS}.
 *
 * `pickup_intent` is declared by both domain tables with the same `{ prompt }` shape; the platform
 * table's entry is the one kept.
 */
export const createListingPresentation = (): Readonly<Record<string, ToolPresentation>> => {
  const { record, isRecord, text, compact } = shapeHelper

  const sessionStatus: ToolPresentation = {
    output: SESSION_STATUS_OUTPUT,
    present: structured => {
      const client = record(structured).client
      if (!isRecord(client) || typeof client.kind !== 'string' || typeof client.inference !== 'boolean') {
        return { client: null }
      }

      return {
        client: compact({
          kind: client.kind,
          version: text(client.version, 64),
          via: typeof client.via === 'string' ? client.via : '',
          inference: client.inference,
        }),
      }
    },
  }
  // The platform table last: its `pickup_intent` replaces the work table's.
  const shaped: Record<string, ToolPresentation> = { ...workPresentation, ...platformPresentation, session_status: sessionStatus }
  const names = [...new Set([...Object.keys(shaped), ...Object.keys(LISTING_TOOLS)])]

  return Object.freeze(Object.fromEntries(names.map(name => [name, { ...shaped[name], ...LISTING_TOOLS[name] }])))
}

export const listingPresentation = createListingPresentation()
