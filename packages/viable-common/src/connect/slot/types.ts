/**
 * A project's workload as a connector reads it — the record's state and its public address, never
 * its infrastructure (namespace, workload, volume, keys).
 *
 * `kind` and `status` are plain strings: this view crosses a version skew, and a newer platform may
 * answer with a value an older connector has never heard of. A record written before `kind` existed
 * is an ephemeral preview workload.
 */
export interface ConnectSlotState {
  id: string
  kind: string
  status: string
  slug: string
  host?: string
  initialized?: boolean
  lastError?: string
  buildWarning?: string
  backendWarning?: string
}

/** {@link ConnectSlotState} with the project it belongs to — one row of the organization's workloads. */
export interface ConnectSlotView extends ConnectSlotState {
  projectId?: string
}
