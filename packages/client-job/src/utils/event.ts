import type { JobEvent, JobRecord } from '@owlmeans/queue'
import { isSettled, JobEventType, JobState } from '@owlmeans/queue'
import type { StateResource } from '@owlmeans/state'

/**
 * Fold one lifecycle frame into the store.
 *
 * The frame is merged over whatever the store holds rather than saved as itself: an event carries
 * only what changed, and `save` replaces the record. An event for an id the store never saw still
 * writes a row — a job enqueued in another tab reports its progress here too, and the next seeding
 * call fills in the rest.
 *
 * A progress frame does NOT move a settled job back to active: the broker's completion and its
 * last progress ping race, and the losing order would leave a finished job spinning forever.
 */
export const applyJobEvent = async (
  store: StateResource<JobRecord>, event: JobEvent
): Promise<void> => {
  const known = await store.load(event.id)

  const change: Partial<JobRecord> = event.type === JobEventType.Completed
    ? { state: JobState.Completed, result: event.result }
    : event.type === JobEventType.Failed
      ? { state: JobState.Failed, error: event.error }
      : {
        progress: event.progress,
        ...(isSettled(known?.state) ? {} : { state: JobState.Active }),
      }

  await store.save({
    ...(known ?? { data: undefined as unknown }),
    id: event.id,
    queue: event.queue,
    // A queue that removed the job has no name left to report — never overwrite a known one
    // with the empty string the contract sends in its place.
    ...(event.name !== '' ? { name: event.name } : {}),
    ...change,
  })
}
