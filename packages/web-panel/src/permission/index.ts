import './i18n.js'
import { createElement } from 'react'
import { toast } from 'sonner'
import type { BasicContext } from '@owlmeans/context'
import { ensureEntrypointFailureService } from '@owlmeans/client-entrypoint'
import { httpStatusOf, incidentIdOf, isAccessDenied } from '@owlmeans/api/status'
import { PermissionDeniedToast } from './toast.js'

export { PermissionDeniedToast } from './toast.js'

/** Opt-in adapter for the context's entrypoint failures; mount one Toaster in the app shell. */
export const appendPermissionDeniedToast = <T extends BasicContext<any>>(context: T): T => {
  const seen = new Map<string, number>()
  ensureEntrypointFailureService(context).registerPlugin({
    alias: 'web-panel:permission-denied-toast',
    onFailure: ({ alias, error }) => {
      if (!isAccessDenied(error)) return
      const now = Date.now()
      if (now - (seen.get(alias) ?? 0) < 2000) return
      seen.set(alias, now)
      toast.warning(createElement(PermissionDeniedToast, {
        alias, status: httpStatusOf(error), incidentId: incidentIdOf(error),
      }))
    },
  })
  return context
}
