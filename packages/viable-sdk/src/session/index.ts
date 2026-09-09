import {
  ConnectOpErrorKind, ConnectOpKind, ConnectSessionStatus
} from '@owlmeans/viable-common'
import type {
  ConnectOp, ConnectOpResult, ConnectSessionView, ConfigurePayload, ModelTask, SlotCommandPayload
} from '@owlmeans/viable-common'
import { PULL_WAIT_MS } from '../consts.js'
import type { ConnectorApi, LocalExecutor, OpenSessionArgs, SessionRuntime, SessionStats } from '../types.js'
import { writeEnv } from '../project/env.js'
import { readMarker, writeMarker } from '../project/marker.js'
import { TaskQueue } from './tasks.js'

export interface SessionOptions {
  api: ConnectorApi
  open: OpenSessionArgs
  /** Absent for a cloud target: the platform's own pod executes its commands. */
  executor?: LocalExecutor
  /** Which deployment this is, recorded in the project's marker so a later connector finds it. */
  apiUrl?: string
  log?: (line: string) => void
}

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

  try {
    const existing = await readMarker(dir)
    if (existing?.projectId === projectId) return

    const status = await opts.api.project.status(projectId)
    await writeMarker(dir, {
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
  const answered = new Map<string, ConnectOpResult>()

  const stats: SessionStats = {
    opsDone: 0,
    opsFailed: 0,
    tasksDelivered: 0,
    tasksSubmitted: 0,
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

    try {
      const value = op.kind === ConnectOpKind.Configure
        ? await writeEnv(requireExecutor().dir, op.payload as ConfigurePayload)
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
   * A long poll rather than a socket, as the first transport: it works through every proxy, needs
   * no reconnection logic, and is the only option the URL-configured host has at all. The socket
   * is an optimisation over it, not a replacement for it.
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
export * from './tasks.js'
