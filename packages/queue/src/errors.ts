import { ResilientError } from '@owlmeans/error'

export class QueueError extends ResilientError {
  public static override typeName = 'QueueError'

  constructor(message: string = 'error') {
    super(QueueError.typeName, `queue:${message}`)
  }
}

/**
 * The caller stopped waiting. The job is untouched — it may still be queued, running, or already
 * finished; only the wait ended. Read the job back to learn which.
 */
export class QueueTimeout extends QueueError {
  public static override typeName = `${QueueError.typeName}Timeout`

  constructor(msg: string) {
    super(`timeout:${msg}`)
    this.type = QueueTimeout.typeName
  }
}

/** No job with that id in this queue — it never existed, or it was removed after completing. */
export class UnknownJob extends QueueError {
  public static override typeName = `${QueueError.typeName}UnknownJob`

  constructor(msg: string) {
    super(`unknown-job:${msg}`)
    this.type = UnknownJob.typeName
  }
}

/**
 * A job name the queue does not declare. Declaring every job a queue accepts is what keeps an
 * enqueue from succeeding into a queue where nothing can ever process it.
 */
export class UnknownJobName extends QueueError {
  public static override typeName = `${QueueError.typeName}UnknownJobName`

  constructor(msg: string) {
    super(`unknown-job-name:${msg}`)
    this.type = UnknownJobName.typeName
  }
}

/** A queue asked for that no declaration names. */
export class UnknownQueue extends QueueError {
  public static override typeName = `${QueueError.typeName}UnknownQueue`

  constructor(msg: string) {
    super(`unknown-queue:${msg}`)
    this.type = UnknownQueue.typeName
  }
}

/**
 * This process was asked to consume a queue it does not listen to. Which queues a process
 * consumes is configuration (`cfg.queue.listen`), so this is a deployment question, not a code
 * one — the same binary is a producer or a worker depending on it.
 */
export class QueueNotListening extends QueueError {
  public static override typeName = `${QueueError.typeName}NotListening`

  constructor(msg: string) {
    super(`not-listening:${msg}`)
    this.type = QueueNotListening.typeName
  }
}

/**
 * The job named an entrypoint this process does not serve. Unlike a missing queue this is not a
 * declaration problem: the alias exists, but nothing here elevated it, so the job was taken by a
 * worker that cannot run it.
 */
export class JobNotServed extends QueueError {
  public static override typeName = `${QueueError.typeName}JobNotServed`

  constructor(msg: string) {
    super(`job-not-served:${msg}`)
    this.type = JobNotServed.typeName
  }
}

/**
 * The signed envelope is older than the configured lifetime. Freshness is judged from when the
 * producer enqueued the job, not from when a worker picked it up, so a long backlog does not
 * invalidate work that was legitimate when it was submitted.
 */
export class EnvelopeExpired extends QueueError {
  public static override typeName = `${QueueError.typeName}EnvelopeExpired`

  constructor(msg: string) {
    super(`envelope-expired:${msg}`)
    this.type = EnvelopeExpired.typeName
  }
}

ResilientError.registerErrorClass(QueueError)
ResilientError.registerErrorClass(QueueTimeout)
ResilientError.registerErrorClass(UnknownJob)
ResilientError.registerErrorClass(UnknownJobName)
ResilientError.registerErrorClass(UnknownQueue)
ResilientError.registerErrorClass(QueueNotListening)
ResilientError.registerErrorClass(JobNotServed)
ResilientError.registerErrorClass(EnvelopeExpired)
