import type { ConnectAppsChangeView } from '@owlmeans/viable-common'
import type { ConnectorApi } from '../../types.js'
import type { ToolDeps, ToolResult } from '../types.js'

/** The connector API's changes of a project's apps — present on a connector that offers them. */
export type ConnectorAppsApi = NonNullable<ConnectorApi['apps']>

/** One change of a project's apps, as a tool asks for it. */
export interface AppsChangeRequest {
  /** `add_app`, `add_area` or `bind_area` — with {@link args}, what an identical repeat joins. */
  tool: string
  args: Record<string, unknown>
  projectId: string
  /** What the platform is doing, as a sentence's middle: `adding the app "partners"`. */
  doing: string
  apply: (api: ConnectorAppsApi) => Promise<ConnectAppsChangeView>
  /** How long the tool waits before it answers that the change goes on; `ATTEND_ANSWER_MS` by default. */
  waitMs?: number
}

/**
 * The three tools that change a project's APP STRUCTURE (`add_app`, `add_area`, `bind_area`) — one
 * behaviour for all of them.
 *
 * A connector without the routes (`api.apps` absent, or a platform that answers the route 404) says
 * the platform cannot do it from here and names modify_project. Otherwise the change is an attended
 * call (`attendedCallHelper`): its answer when it settles within the tool's deadline — what changed,
 * what did not go through, then the apps as they stand (structured: the view) — else that the
 * platform is still applying it under the project's lock, project_apps / project_status showing the
 * result (structured `{ running, projectId }`). A refusal is phrased (`slot-app:change-refused:`).
 */
export interface AppsChangeToolHelper {
  change: (deps: ToolDeps, request: AppsChangeRequest) => Promise<ToolResult>
  /** What changed, what did not go through, then the apps as they now stand. */
  renderChange: (view: ConnectAppsChangeView) => string
}
