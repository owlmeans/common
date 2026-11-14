import type { ConnectProjectStatus, ConnectTarget } from '@owlmeans/viable-common'
import type { ProjectEdits } from '../../types.js'

/**
 * A project's create and confirm with its references read by the platform — bound to ONE
 * `ConnectorApi` (`referencesToolOf(api)`), the API a tool was handed.
 *
 * Each member asks the references route first (`connect.project.createWithReferences`,
 * `connect.project.confirmWithReferences`) and, when the platform does not have it — a 404 that names
 * no incident, the answer of a platform older than the route — the released route with the same
 * arguments; the API remembers it and asks the released route directly from then on. Any other
 * refusal is thrown as it came.
 */
export interface ReferencesTool {
  /** `project.createWithReferences`, else `project.create`. */
  create: (prompt: string, target?: ConnectTarget, sessionId?: string) => Promise<ConnectProjectStatus>
  /** `project.confirmWithReferences`, else `project.confirm`. */
  confirm: (projectId: string, edits: ProjectEdits) => Promise<ConnectProjectStatus>
  /** Whether the platform serves the references routes: `true` once one answered, `false` once one was missing, `null` before any was asked. */
  supported: () => boolean | null
}
