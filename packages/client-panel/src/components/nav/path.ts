import { clientBaseOf } from '@owlmeans/client'
import type { ClientContext } from '@owlmeans/client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { PanelNavPathHelper } from './types.js'

const normalizePath = (path: string): string => (path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path)

export const makePanelNavPathHelper = (context: ClientContext<any>): PanelNavPathHelper => {
  const entrypointOf = (alias: string): ClientEntrypoint<string> | null => {
    try {
      return context.entrypoint<ClientEntrypoint<string>>(alias)
    } catch {
      // A protocol the app never bound addresses nothing — it cannot be the current screen,
      // and it must not take the menu down with it.
      return null
    }
  }

  const pathOf = (alias: string): string | null => {
    try {
      const entrypoint = entrypointOf(alias)

      return entrypoint == null ? null : normalizePath(entrypoint.path())
    } catch {
      return null
    }
  }

  const hrefOf = (alias: string): string | undefined => {
    const entrypoint = entrypointOf(alias)
    if (entrypoint?.isLocal?.() === false) {
      return undefined
    }
    const path = pathOf(alias)

    return path == null || path.includes(':') ? undefined : clientBaseOf(context).href(path)
  }

  return { pathOf, hrefOf }
}
