import type { Workcard } from '@owlmeans/planning'
import type { ConnectAppsView } from '@owlmeans/viable-common'
import type { LocalRunStatus } from '../../run/types.js'
import type { ToolDeps } from '../types.js'

/**
 * How the connector's tools speak about a project's applications: the apps view as lines, the answer
 * of a platform older than the apps routes, and the app a story card names.
 */
export interface AppsToolHelper {
  /**
   * The apps view as a parent reads it: one line per app (its path, areas, interface build, server
   * and the cause of a failure), the worker, and — for a local project — where each app answers on
   * this machine when `local` (the run's status) is given. Ends with the next valid action.
   */
  renderApps: (view: ConnectAppsView, local?: LocalRunStatus | null) => string
  /**
   * The view a platform older than `connect.project.apps` stands for: one app, `main`, at the root,
   * over the four standard areas — nothing live claimed.
   */
  legacyView: (projectId: string, local: boolean) => ConnectAppsView
  /**
   * Whether a refusal means the platform has no apps route at all: a 404 that names no app marker,
   * confirmed by the project itself still answering its status — so a project of another
   * organization (also a 404) is never mistaken for an older platform.
   */
  routeMissing: (deps: Pick<ToolDeps, 'api'>, projectId: string, error: unknown) => Promise<boolean>
  /**
   * The app names each story card names (`fields.areaKey` and `fields.areas`, mapped through the
   * project's app map — read once, and only when some card names an area). A card that names none is
   * absent from the answer, so a project without apps reads exactly as before.
   */
  storyApps: (deps: Pick<ToolDeps, 'api'>, projectId: string, cards: readonly Workcard[]) => Promise<Map<string, string[]>>
}
