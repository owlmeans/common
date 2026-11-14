import { ApiStatusError, apiStatusHelper } from '@owlmeans/api'
import { memoHelper } from '@owlmeans/context'
import type { ConnectorApi } from '../types.js'
import { NOT_FOUND } from '../api/consts.local.js'
import type { ReferencesTool } from './references/types.js'

/**
 * A route this platform does not serve: Fastify's own 404, rebuilt as a bare status error with no
 * incident id. A refusal the platform DECIDED (`ProjectNotFound`, 404 too) arrives as its own class in
 * development and carries an incident id in production — never read as a missing route.
 */
const routeMissing = (error: unknown): boolean => error instanceof ApiStatusError
  && apiStatusHelper.httpStatusOf(error) === NOT_FOUND
  && apiStatusHelper.incidentIdOf(error) == null

export const makeReferencesTool = (api: ConnectorApi): ReferencesTool => {
  // An implementation of the interface written before the members (a host's own, compiled against an
  // older SDK) has neither: it is answered by the released routes, exactly as before.
  let supported: boolean | null = typeof api.project.createWithReferences === 'function'
    && typeof api.project.confirmWithReferences === 'function' ? null : false

  const withFallback = async <T>(ask: () => Promise<T>, released: () => Promise<T>): Promise<T> => {
    if (supported === false) return await released()
    try {
      const answer = await ask()
      supported = true

      return answer
    } catch (error) {
      if (!routeMissing(error)) throw error
      // An older platform: the released route, with exactly the same arguments, from now on.
      supported = false

      return await released()
    }
  }

  const create: ReferencesTool['create'] = async (prompt, target, sessionId) => await withFallback(
    async () => await api.project.createWithReferences(prompt, target, sessionId),
    async () => await api.project.create(prompt, target, sessionId),
  )

  const confirm: ReferencesTool['confirm'] = async (projectId, edits) => await withFallback(
    async () => await api.project.confirmWithReferences(projectId, edits),
    async () => await api.project.confirm(projectId, edits),
  )

  return { create, confirm, supported: () => supported }
}

/** The references create and confirm of one connector API — one per API, so a 404 is asked once. */
export const referencesToolOf = memoHelper.oncePer(makeReferencesTool)
