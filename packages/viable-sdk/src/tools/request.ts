import { memoHelper } from '@owlmeans/context'
import type { ConnectorApi } from '../types.js'
import { cardsToolHelper } from './cards.js'
import type { RequestTool } from './request/types.js'

export const makeRequestTool = (api: ConnectorApi): RequestTool => {
  // An implementation written before the member (a host's own, compiled against an older SDK) is
  // answered by the released route from the start, exactly as before.
  let supported: boolean | null = typeof api.project.request === 'function' ? null : false

  const ask: RequestTool['ask'] = async (projectId, prompt) => {
    if (supported !== false) {
      try {
        const view = await api.project.request(projectId, prompt)
        supported = true

        return { view }
      } catch (error) {
        if (!cardsToolHelper.routeMissing(error)) throw error
        // An older platform: the released open-ended change, with the same prompt, from now on.
        supported = false
      }
    }

    return { view: null, status: await api.project.modify(projectId, prompt) }
  }

  return { ask, supported: () => supported }
}

/** The triaged request of one connector API — one per API, so a missing route is asked once. */
export const requestToolOf = memoHelper.oncePer(makeRequestTool)
