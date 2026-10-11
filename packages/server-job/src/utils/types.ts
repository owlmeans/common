import type { JobJson, PublicJobError } from '@owlmeans/job'

export interface JobViewFields {
  id: string
  kind: string
  summary?: string
  metadata?: Record<string, JobJson>
  result?: JobJson
  error?: PublicJobError
  cancellable?: boolean
}
