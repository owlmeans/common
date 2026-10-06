import type { FlowJob } from 'bullmq'

/** A child of a flow job (bullmq 6 no longer exports the name). */
export type FlowChildJob = NonNullable<FlowJob['children']>[number]
