import { TARGET_API_BASE } from '@owlmeans/viable-common'

import { probeListening } from './spawn.js'

/**
 * Reading the target's own health endpoint, and deciding what its answer means.
 *
 * Two callers need it and they must agree: the boot check, which waits for a boot to resolve one
 * way or the other, and the local run's status, which is the only thing that ever notices a target
 * that came up and then stopped being able to serve. The classifier is pure and the IO is a thin
 * wrapper over it.
 */

/** The shape a target's `/api/healtz` answers with. Every field is optional by contract. */
export interface TargetHealthBody {
  phase?: string
  error?: string
  bootId?: string
  db?: { ok?: boolean, error?: string, summary?: string }
  /**
   * The target's own verdict on its job queue store, reported exactly like `db`.
   *
   * Absent from every target that has no queue — most of them — so an omitted value means
   * "nothing to report", never "unhealthy".
   */
  valkey?: { ok?: boolean, error?: string, summary?: string }
}

export interface TargetHealthInput {
  /** Boot id handed to the current child; '' when none was minted. */
  bootId: string
  /** Whether a TCP connect to the port succeeded at all. */
  listening: boolean
  /** HTTP status of the answer; null when the request never completed. */
  status: number | null
  /** Parsed body, or null when there was none or it was not JSON. */
  body: TargetHealthBody | null
  /** Why the request failed, when it did. */
  failure?: string
}

export interface TargetHealthReading {
  /** The target says it is serving. */
  ready: boolean
  /** No amount of waiting changes this answer — the caller must act. */
  terminal: boolean
  /** Human-readable cause, '' when ready. */
  reason: string
  /** The answer came from a process this connector did not start. */
  foreign: boolean
  /** The phase the target reported, when it reported one. */
  phase?: string
  dbOk?: boolean
  valkeyOk?: boolean
}

/** Where the api answers. The worker has a health port but no api base in front of it. */
export const TARGET_HEALTH_PATH = `/${TARGET_API_BASE}/healtz`

const ok = (): TargetHealthReading => ({ ready: true, terminal: false, reason: '', foreign: false })

const not = (
  reason: string, terminal = false, extra: Partial<TargetHealthReading> = {}
): TargetHealthReading => ({ ready: false, terminal, reason, foreign: false, ...extra })

/**
 * What a target's answer means.
 *
 * The order of these checks is the contract, not a style choice:
 *
 * 1. **Identity outranks health.** A leftover process answering `200 ok` is still a leftover, and
 *    everything it reports describes the build IT was started with. Terminal, because waiting
 *    never turns another process's health into ours — the port has to be taken back.
 * 2. **A non-2xx is a failure even when the body cannot be parsed.** This is what made a target
 *    answering 503 with an HTML error page read as *ready*: an unparseable body left `phase`
 *    undefined, and undefined meant "an old target that only listens once it is up".
 * 3. **A target that says it failed is terminal**, and its own message is the reason.
 * 4. **A database the target cannot reach is a failure it will not report any other way.** It
 *    answers `200 {status:'OK'}` with `db.ok: false`, which by rule 2's fallback would also have
 *    read as ready. Not terminal: a database that went away can come back.
 * 5. **A queue store it cannot reach is the same failure with a different dependency** — an app
 *    whose jobs cannot be enqueued serves pages and silently does none of the work behind them.
 * 6. Only then does a missing phase mean "an older target, and a reachable port is the answer".
 */
export const classifyTargetHealth = (input: TargetHealthInput): TargetHealthReading => {
  if (!input.listening) {
    return not('The target backend is running but never bound its port')
  }

  if (input.failure != null) {
    // A timeout is materially different from a refused connection: the port answered, so
    // something is there — it just cannot serve its own health endpoint. Say which.
    const timedOut = /timeout|aborted/i.test(input.failure)

    return not(timedOut
      ? 'The target backend bound its port but its health endpoint did not answer in time'
      : `The target backend health check failed: ${input.failure}`)
  }

  const body = input.body
  if (input.bootId !== '' && typeof body?.bootId === 'string' && body.bootId !== ''
    && body.bootId !== input.bootId) {
    return not(
      'The backend port is held by a leftover process running an older build',
      true, { foreign: true, phase: body.phase }
    )
  }

  if (input.status != null && (input.status < 200 || input.status >= 300)) {
    const detail = body?.error ?? body?.db?.error

    return not(`The target backend health endpoint answered ${input.status}`
      + (detail != null && detail !== '' ? `: ${detail}` : ''), false, { phase: body?.phase })
  }

  if (body?.phase === 'failed') {
    const reason = body.error ?? body.db?.error ?? body.valkey?.error ?? 'unknown error'

    return not(`The target backend failed to initialize: ${reason}`, true, {
      phase: body.phase, dbOk: body.db?.ok, valkeyOk: body.valkey?.ok,
    })
  }

  if (body?.db?.ok === false) {
    const detail = body.db.error ?? body.db.summary ?? 'unknown error'

    return not(`The target backend cannot reach its database: ${detail}`, false, {
      phase: body.phase, dbOk: false, valkeyOk: body.valkey?.ok,
    })
  }

  if (body?.valkey?.ok === false) {
    const detail = body.valkey.error ?? body.valkey.summary ?? 'unknown error'

    return not(`The target backend cannot reach its queue store: ${detail}`, false, {
      phase: body.phase, dbOk: body.db?.ok, valkeyOk: false,
    })
  }

  if (body?.phase == null || body.phase === 'ready') {
    return { ...ok(), phase: body?.phase, dbOk: body?.db?.ok, valkeyOk: body?.valkey?.ok }
  }

  return not('The target backend is still initializing', false, {
    phase: body.phase, dbOk: body.db?.ok, valkeyOk: body.valkey?.ok,
  })
}

export interface TargetHealthProbes {
  probe?: (port: number) => Promise<boolean>
  fetch?: typeof globalThis.fetch
  /** The worker answers the same contract at a path of its own. */
  path?: string
}

/**
 * Ask the target how it is, and classify the answer.
 *
 * The TCP probe runs first and short-circuits: there is no point spending a request timeout on a
 * port nothing is listening on, and a target mid-restart is exactly when this is called most.
 */
export const readTargetHealth = async (
  port: number, bootId: string, timeoutMs: number, probes: TargetHealthProbes = {}
): Promise<TargetHealthReading> => {
  const probe = probes.probe ?? probeListening
  const doFetch = probes.fetch ?? globalThis.fetch

  if (!await probe(port)) {
    return classifyTargetHealth({ bootId, listening: false, status: null, body: null })
  }

  try {
    const response = await doFetch(
      `http://127.0.0.1:${port}${probes.path ?? TARGET_HEALTH_PATH}`,
      { signal: AbortSignal.timeout(timeoutMs) }
    )
    const body = await response.json().catch(() => null) as TargetHealthBody | null

    return classifyTargetHealth({ bootId, listening: true, status: response.status, body })
  } catch (e) {
    const error = e as Error

    return classifyTargetHealth({
      bootId, listening: true, status: null, body: null,
      failure: error?.name === 'TimeoutError' ? 'TimeoutError' : String(error?.message ?? e),
    })
  }
}
