import type { ReactNode } from 'react'
import type { JobRecord, JobState } from '@owlmeans/queue'
import type { StyledProps } from '../components/types.js'

export interface JobProps extends StyledProps {
  job: JobRecord
}

export interface JobStatusProps extends JobProps {
  /**
   * What each state is called on screen.
   *
   * There is no packaged wording: the states are broker vocabulary, and the sentence an app wants
   * for them ("Queued", "Rendering", "Ready") is the app's own copy in the app's own namespace.
   * Absent a label the raw state is rendered, which is data rather than an untranslated string.
   */
  labels?: Partial<Record<JobState, ReactNode>>
}

export interface JobToastOptions {
  /** What the toast says. The job's own name when omitted. */
  message?: (job: JobRecord) => ReactNode
}
