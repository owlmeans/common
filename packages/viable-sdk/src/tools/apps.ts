import { apiStatusHelper } from '@owlmeans/api'
import type { Workcard } from '@owlmeans/planning'
import {
  MAIN_APP, TARGET_WEB_PORT, appMapHelper, storyFieldsOf, type AppMap, type ConnectAppView,
} from '@owlmeans/viable-common'
import type { LocalAppStatus } from '../run/types.js'
import { CAUSE_LINE_MAX, LOCAL_MAP_NOTE } from './apps/consts.local.js'
import type { AppsToolHelper } from './apps/types.js'
import { refusalHelper } from './refusal.js'
import { NOT_FOUND } from '../api/consts.local.js'

export const createAppsToolHelper = (): AppsToolHelper => {
  const pathOf = (mount: string): string => mount === '' ? '/' : `/${mount}`

  const cut = (text: string): string => {
    const line = text.split('\n').map(part => part.trim()).filter(part => part !== '').join(' ')

    return line.length > CAUSE_LINE_MAX ? `${line.slice(0, CAUSE_LINE_MAX)}…` : line
  }

  const appLine = (app: ConnectAppView, local: LocalAppStatus | undefined): string => {
    const parts = [
      `${app.name} · ${pathOf(app.mount)}`,
      app.areas.length > 0 ? `areas ${app.areas.join(', ')}` : 'no areas',
      ...(app.build != null ? [`interface ${app.build}`] : []),
      ...(app.backend != null ? [`server ${app.backend}${app.pending === true ? ' (in progress)' : ''}`] : []),
      ...(app.url != null && local == null ? [app.url] : []),
      ...(local != null
        ? [`here ${local.url} — ${local.ready ? 'serving' : `not serving${local.reason != null ? `: ${cut(local.reason)}` : ''}`}`]
        : []),
    ]
    const cause = app.cause != null && app.cause !== ''
      ? `\n      ${app.causeKind != null ? `${app.causeKind}: ` : ''}${cut(app.cause)}`
      : ''

    return `  ${parts.join(' · ')}${cause}`
  }

  /** An app needs a person's attention: its build or its server failed, or it says why it is not serving. */
  const failing = (app: ConnectAppView): boolean =>
    app.build === 'failed' || app.backend === 'crashed' || app.backend === 'failed' || (app.cause ?? '') !== ''

  const renderApps: AppsToolHelper['renderApps'] = (view, local) => {
    const localApps = new Map((local?.apps ?? []).map(app => [app.name, app]))
    const head = view.apps.length > 1
      ? `${view.apps.length} applications, each under its own path of the project's address:`
      : view.recorded
        ? 'One application, main, at the root of the project\'s address:'
        : 'One application, main, at the root of the project\'s address (the project records no apps):'
    const lines = [head, ...view.apps.map(app => appLine(app, localApps.get(app.name)))]
    if (view.worker != null) lines.push(`worker: ${view.worker.phase ?? 'reported'}`)
    if (view.local) {
      lines.push(`${LOCAL_MAP_NOTE} http://localhost:${TARGET_WEB_PORT}.`)
      if (local != null && !local.running) lines.push('Nothing runs here now — run_local starts every application.')
    }
    const broken = view.apps.find(failing)
    lines.push(`next: ${broken != null
      ? `restart_project_app { "projectId": "${view.projectId}", "app": "${broken.name}" } once its cause is fixed`
      : `project_status { "projectId": "${view.projectId}" }`}`)

    return lines.join('\n')
  }

  const legacyView: AppsToolHelper['legacyView'] = (projectId, local) => {
    const map = appMapHelper.legacy()

    return {
      projectId,
      local,
      recorded: false,
      apps: map.apps.map(app => ({ name: app.name, mount: app.mount, areas: [...app.areas], main: app.name === MAIN_APP })),
    }
  }

  const routeMissing: AppsToolHelper['routeMissing'] = async (deps, projectId, error) => {
    if (apiStatusHelper.httpStatusOf(error) !== NOT_FOUND) return false
    if (refusalHelper.refusalMessage(error).includes('slot-app:')) return false
    try {
      await deps.api.project.status(projectId)

      return true
    } catch {
      return false
    }
  }

  /** The area keys a story card names beyond its kind; empty for a card that names none. */
  const namedAreas = (card: Workcard): string[] => {
    const fields = storyFieldsOf(card)
    const extra = (fields.areas ?? []).filter(key => typeof key === 'string' && key !== '')
    if ((fields.areaKey == null || fields.areaKey === '') && extra.length < 1) return []

    return [fields.areaKey ?? fields.area, ...extra].filter((key): key is string => typeof key === 'string' && key !== '')
  }

  const storyApps: AppsToolHelper['storyApps'] = async (deps, projectId, cards) => {
    const named = cards.map(card => [card, namedAreas(card)] as const).filter(([, areas]) => areas.length > 0)
    const answer = new Map<string, string[]>()
    if (named.length < 1) return answer

    const project = await deps.api.planning.cards.load(projectId).catch(() => null)
    const map: AppMap = appMapHelper.of((project?.fields ?? null) as { apps?: AppMap | null } | null)
    for (const [card, areas] of named) {
      const apps = appMapHelper.touchedBy(map, areas).map(app => app.name)
      answer.set(card.id ?? card.code ?? '', apps.length > 0 ? apps : [appMapHelper.homeAppOf(map, areas[0]!).name])
    }

    return answer
  }

  return { renderApps, legacyView, routeMissing, storyApps }
}

export const appsToolHelper = createAppsToolHelper()
