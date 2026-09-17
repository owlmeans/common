import type { ConnectJobKind } from './consts.js'

/**
 * The separator a job id is joined with.
 *
 * `~`, because every other separator in play is already spoken for: a route alias is
 * colon-delimited and so is every run id (`init:<projectId>`, `story:<storyId>`), so a job id
 * built with one could not be split back apart.
 */
export const JOB_SEPARATOR = '~'

/**
 * A job's id: its kind, the project card it belongs to, and the subject it is about.
 *
 * The suffix is a CARD id for a story job and a run id for a pipeline job — never a story code.
 * Declared here rather than by whoever answers the job, because the SDK composes the id it then
 * polls for: two spellings of one id is a job nobody can find.
 */
export const jobIdOf = (kind: ConnectJobKind, projectId: string, suffix?: string): string =>
  [kind, projectId, ...(suffix != null ? [suffix] : [])].join(JOB_SEPARATOR)

export interface ParsedJobId {
  kind: ConnectJobKind
  projectId: string
  suffix?: string
}

/** Split a job id back into what {@link jobIdOf} composed it from. */
export const parseJobId = (jobId: string): ParsedJobId => {
  const [kind, projectId, ...rest] = jobId.split(JOB_SEPARATOR)
  // A suffix may carry the separator back if one ever ends up in a card or run id, so the tail is
  // rejoined rather than taken as its first segment.
  const suffix = rest.length > 0 ? rest.join(JOB_SEPARATOR) : undefined

  return {
    kind: kind as ConnectJobKind,
    projectId: projectId ?? '',
    ...(suffix != null ? { suffix } : {}),
  }
}
