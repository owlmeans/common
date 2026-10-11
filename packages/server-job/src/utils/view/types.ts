import type { JobJson, JobView, PublicJobError } from '@owlmeans/job'
import type { JobRecord } from '@owlmeans/queue'
import type { JobViewFields } from '../types.js'

/** The public projection of a broker job: nothing crosses the boundary that was not allowlisted. */
export interface JobViewHelper {
  /** Copy JSON through bounded, prototype-free containers and discard every non-JSON value. */
  sanitizeJobJson: (value: unknown, depth?: number) => JobJson | undefined
  /** Build a public view from fields an application explicitly allowlisted. */
  jobViewOf: (record: JobRecord, fields: JobViewFields) => JobView
  /** Safe default for a broker failure; raw reasons and stacks never cross the boundary. */
  publicJobError: (type?: string) => PublicJobError
}
