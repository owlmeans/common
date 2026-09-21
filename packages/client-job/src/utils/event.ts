import type { JobView, JobViewEvent } from '@owlmeans/job'
import type { StateResource } from '@owlmeans/state'

/**
 * Fold one lifecycle frame into the store.
 *
 * An upsert carries the complete sanitized public view and replaces the stored row. An event for
 * an id the store never saw still writes a row, so an operation started in another tab reports its
 * progress here too. A remove carries only the opaque public id.
 */
export const applyJobEvent = async (
  store: StateResource<JobView>, event: JobViewEvent
): Promise<void> => {
  if (event.type === 'remove') {
    if (await store.load(event.id) != null) await store.delete(event.id)
    return
  }
  await store.save(event.job)
}
