import type { ConnectProjectStatus, ConnectRequestView } from '@owlmeans/viable-common'

/**
 * What a request became: the platform's triage of it (`view`), or — on a platform older than the
 * request route — the released open-ended change's project status (`status`, `view` null).
 */
export interface RequestOutcome {
  view: ConnectRequestView | null
  status?: ConnectProjectStatus
}

/**
 * A person's request in words, bound to ONE `ConnectorApi` (`requestToolOf(api)`): asked of the
 * triaging route (`connect.project.request`) first and, when the platform does not have it — a 404
 * that names no incident — of the released `connect.project.modify` with the same prompt; the API
 * remembers it and asks the released route directly from then on. Any other refusal is thrown as it came.
 */
export interface RequestTool {
  ask: (projectId: string, prompt: string) => Promise<RequestOutcome>
  /** Whether the platform triages requests: `true` once the route answered, `false` once it was missing, `null` before. */
  supported: () => boolean | null
}
