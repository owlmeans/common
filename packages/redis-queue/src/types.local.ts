import { Queue, type Job, type QueueEventsListener } from 'bullmq'
import { PUBLISHED_EVENT } from './consts.js'

/**
 * The queue named by the job type it carries rather than by the payload type.
 *
 * bullmq derives its data, result and name types from the first argument, and it derives them
 * through a conditional that a bare type parameter leaves unresolved — naming the job itself is
 * what lets `add` and `getJob` speak in `D` and `R` instead of in `any`.
 */
export type JobQueue<D, R> = Queue<Job<D, R, string>>

/**
 * An event this driver published itself, carried under a name of its own so that a hand-made
 * event can never be mistaken for one the broker wrote.
 */
export interface PublishedListener extends QueueEventsListener {
  [PUBLISHED_EVENT]: (args: { payload: string }, id: string) => void
}
