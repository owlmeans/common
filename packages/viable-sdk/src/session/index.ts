import { ConnectOpErrorKind, ConnectOpKind, ConnectSessionStatus, type ConnectOp, type ConnectOpResult, type ConnectSessionView, type ConfigurePayload, type InquiryPayload, type ModelTask, type SlotCommandPayload } from '@owlmeans/viable-common'
import { PULL_WAIT_MS } from '../consts.js'
import type { LocalExecutor, SessionRuntime, SessionStats } from '../types.js'
import { makeProjectEnvHelper } from '../project/env.js'
import { makeMarkerHelper } from '../project/marker.js'
import { QuestionQueue } from './questions.js'
import { TaskQueue } from './tasks.js'
import type { SessionOptions } from './types.js'

/**
 * One attached connector, running.
 *
 * The loop is deliberately simple and deliberately serial: pull operations, answer them one at a
 * time, put model tasks aside for the parent agent to drain. Serial because the thing on the other
 * end of a local operation is a filesystem the platform believes it is the only writer of — two
 * concurrent template writes into the same tree is not a throughput problem, it is a corrupted
 * tree.
 *
 * Results are remembered by operation id. A connector that reconnects is handed everything still
 * outstanding, including whatever it had already answered when the connection dropped, and
 * re-executing a build or a model task because an acknowledgement was lost is exactly the cost
 * this avoids.
 */
/**
 * Record which project a directory belongs to.
 *
 * Attaching a connector to a project IS the moment the directory becomes that project's, so it is
 * the moment to say so on disk. Without it `attach_project` cannot find a project by its directory
 * and a connector started here tomorrow has to be told again which project this is — the marker is
 * read at startup for exactly that. It holds no secret and is meant to be committed.
 *
 * Best-effort: a session that works is worth more than a note about it, and the platform is the
 * authority on what this project is either way.
 */
const recordMarker = async (opts: SessionOptions, projectId: string): Promise<void> => {
  const dir = opts.open.projectDir
  if (dir == null) return

  const markers = makeMarkerHelper(dir)
  try {
    const existing = await markers.readMarker()
    if (existing?.projectId === projectId) return

    const status = await opts.api.project.status(projectId)
    await markers.writeMarker({
      version: 1,
      apiUrl: opts.apiUrl ?? '',
      projectId,
      slug: status.slot?.slug ?? status.project.alias,
      createdAt: new Date().toISOString(),
    })
  } catch (e) {
    (opts.log ?? (() => undefined))(`could not record the project marker: ${(e as Error).message}`)
  }
}

export const openSession = async (opts: SessionOptions): Promise<SessionRuntime> => {
  const log = opts.log ?? (() => undefined)
  const session: ConnectSessionView = await opts.api.openSession(opts.open)
  if (session.projectId != null) await recordMarker(opts, session.projectId)
  const tasks = new TaskQueue()
  const questions = new QuestionQueue()
  const answered = new Map<string, ConnectOpResult>()

  const stats: SessionStats = {
    opsDone: 0,
    opsFailed: 0,
    tasksDelivered: 0,
    tasksSubmitted: 0,
    questionsDelivered: 0,
    questionsAnswered: 0,
    lastActivityAt: Date.now(),
    transport: 'pull',
  }

  let closed = false

  const submit = async (result: ConnectOpResult): Promise<void> => {
    answered.set(result.opId, result)
    stats.lastActivityAt = Date.now()
    try {
      await opts.api.submitOp(session.id, result)
    } catch (e) {
      // A lost acknowledgement is not a lost answer: the operation stays in the platform's store
      // and is redelivered, and the cached result answers it without doing the work again.
      log(`submit failed for ${result.opId}: ${(e as Error).message}`)
    }
  }

  const perform = async (op: ConnectOp): Promise<void> => {
    const cached = answered.get(op.id)
    if (cached != null) {
      await submit(cached)

      return
    }

    if (op.kind === ConnectOpKind.ModelTask) {
      // Not executed here at all — it is the parent agent's to run, in its own clean subagent.
      // What this loop owes it is delivery and nothing else.
      if (tasks.push(op.payload as ModelTask, op.id)) {
        stats.tasksDelivered += 1
        stats.lastActivityAt = Date.now()
      }

      return
    }

    if (op.kind === ConnectOpKind.Inquiry) {
      // Executed by nobody: it is a decision about the user's own project, and a connector that
      // answered one itself would build a whole application on a guess nobody made. Queued for
      // the parent agent to put to a person, exactly as a model task is queued for its subagent.
      if (questions.push(op.payload as InquiryPayload, op.id)) {
        stats.questionsDelivered += 1
        stats.lastActivityAt = Date.now()
      }

      return
    }

    try {
      const value = op.kind === ConnectOpKind.Configure
        ? await makeProjectEnvHelper(requireExecutor().dir).writeEnv(op.payload as ConfigurePayload)
        : await requireExecutor().execute(op.payload as SlotCommandPayload)
      stats.opsDone += 1
      await submit({ opId: op.id, sessionId: session.id, ok: true, value })
    } catch (e) {
      stats.opsFailed += 1
      const error = e as Error
      log(`operation ${op.id} failed: ${error.message}`)
      await submit({
        opId: op.id,
        sessionId: session.id,
        ok: false,
        error: {
          type: error.name,
          message: error.message,
          // A local failure is the connector's own — it ran and could not do the thing. Saying
          // `Unavailable` here would tell the platform to give up on a run that is fine.
          kind: ConnectOpErrorKind.Refused,
        },
      })
    }
  }

  const requireExecutor = (): LocalExecutor => {
    if (opts.executor == null) {
      throw new Error('this session executes nothing locally — its target is a platform slot')
    }

    return opts.executor
  }

  /**
   * The pull loop.
   *
   * A long poll, the connector's only transport: it works through every proxy and needs no
   * reconnection logic.
   */
  const loop = async (): Promise<void> => {
    while (!closed) {
      try {
        const ops = await opts.api.pullOps(session.id, Math.floor(PULL_WAIT_MS / 1000))
        stats.lastActivityAt = Date.now()
        for (const op of ops) {
          if (closed) break
          await perform(op)
        }
      } catch (e) {
        if (closed) break
        log(`pull failed: ${(e as Error).message}`)
        await new Promise(resolve => setTimeout(resolve, 2_000))
      }
    }
  }

  void loop()

  return {
    session,
    stats,

    nextTask: async waitMs => {
      const task = await tasks.take(waitMs)
      if (task != null) stats.lastActivityAt = Date.now()

      return task
    },

    submitTask: async result => {
      const opId = tasks.opIdOf(result.taskId)
      if (opId == null) {
        log(`no operation is waiting for task ${result.taskId}`)

        return
      }
      tasks.settle(result.taskId)
      stats.tasksSubmitted += 1
      await submit({ opId, sessionId: session.id, ok: true, value: result })
    },

    taskById: taskId => tasks.outstandingById(taskId),

    outstandingTasks: () => tasks.outstandingTasks(),

    pendingTasks: () => tasks.size(),

    nextQuestion: async waitMs => {
      const question = await questions.take(waitMs)
      if (question != null) stats.lastActivityAt = Date.now()

      return question
    },

    answerQuestion: async answer => {
      const opId = questions.opIdOf(answer.inquiryId)
      if (opId == null) {
        // The question outlived its operation — the run parked and stopped waiting on this
        // session. The answer is not lost: it is sent by id through `connect.inquiry.answer`,
        // which is the caller's fallback and the reason this reports rather than throws.
        log(`no operation is waiting for question ${answer.inquiryId}`)

        return
      }
      questions.settle(answer.inquiryId)
      stats.questionsAnswered += 1
      await submit({ opId, sessionId: session.id, ok: true, value: answer })
    },

    questionById: inquiryId => questions.outstandingById(inquiryId),

    outstandingQuestions: () => questions.outstandingQuestions(),

    pendingQuestions: () => questions.size(),

    close: async () => {
      closed = true
      try {
        await opts.api.closeSession(session.id)
      } catch (e) {
        log(`close failed: ${(e as Error).message}`)
      }
    },
  }
}

export { ConnectSessionStatus }
export * from './queue.js'
export * from './tasks.js'
export * from './questions.js'

export type { SessionOptions } from './types.js'
