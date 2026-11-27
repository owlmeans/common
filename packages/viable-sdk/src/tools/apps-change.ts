import { appsToolHelper } from './apps.js'
import { attendedCallHelper } from './attended.js'
import { APPS_CHANGE_UNSUPPORTED } from './apps-change/consts.js'
import type { AppsChangeToolHelper } from './apps-change/types.js'

export const createAppsChangeToolHelper = (): AppsChangeToolHelper => {
  const renderChange: AppsChangeToolHelper['renderChange'] = view => [
    view.summary,
    ...(view.warnings != null && view.warnings.length > 0 ? [`Not everything went through: ${view.warnings.join('; ')}.`] : []),
    appsToolHelper.renderApps(view),
  ].join('\n')

  const change: AppsChangeToolHelper['change'] = async (deps, { tool, args, projectId, doing, apply, waitMs }) => {
    const api = deps.api.apps
    if (api == null) return { text: APPS_CHANGE_UNSUPPORTED, isError: true }

    return await attendedCallHelper.attend(deps, {
      tool, args, ...(waitMs != null ? { waitMs } : {}),
      run: async () => {
        try {
          const view = await apply(api)

          return { text: renderChange(view), structured: view }
        } catch (e) {
          // A bare 404 from a platform that answers the project otherwise: it has no such route.
          if (await appsToolHelper.routeMissing(deps, projectId, e)) return { text: APPS_CHANGE_UNSUPPORTED, isError: true }
          throw e
        }
      },
      pending: async rejoinable => ({
        text: `The platform is still ${doing}: the project stays locked until it is done, and project_apps`
          + ` { "projectId": "${projectId}" } shows the applications and areas once it is (project_status says when`
          + ' the agent let go).'
          + (rejoinable ? ` Calling ${tool} again with the same arguments waits on the same change rather than starting another.` : ''),
        structured: { running: tool, projectId },
      }),
    })
  }

  return { change, renderChange }
}

export const appsChangeToolHelper = createAppsChangeToolHelper()
