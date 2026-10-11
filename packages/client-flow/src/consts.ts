
export const DEFAULT_ALIAS = 'flow'

export const FLOW_STATE = 'state:flow'

export const EXTRA_FLOW = 'extra-flow'

export const REHACK_MOD = '__redirect'

/** The record id a suspended landing is stored under, in the SAME resource `EXTRA_FLOW` uses —
 * a side-band slot, never the live `FlowService.flow` and never the `?flow=` query parameter. */
export const RESUME_FLOW = 'resume-flow'
