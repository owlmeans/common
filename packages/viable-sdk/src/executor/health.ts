
import { spawnHelper } from './spawn.js'
import { TARGET_HEALTH_PATH } from './consts.js'
import type { TargetHealthBody, TargetHealthInput, TargetHealthProbes, TargetHealthReading } from './types.js'
import type { HealthHelper } from './health/types.js'

/**
 * Reading the target's own health endpoint, and deciding what its answer means.
 *
 * Two callers need it and they must agree: the boot check, which waits for a boot to resolve one
 * way or the other, and the local run's status, which is the only thing that ever notices a target
 * that came up and then stopped being able to serve. The classifier is pure and the IO is a thin
 * wrapper over it.
 */

export const createHealthHelper = (): HealthHelper => {
  const ok = (): TargetHealthReading => ({ ready: true, terminal: false, reason: '', foreign: false })

  const not = (
    reason: string, terminal = false, extra: Partial<TargetHealthReading> = {}
  ): TargetHealthReading => ({ ready: false, terminal, reason, foreign: false, ...extra })

  const classifyTargetHealth = (input: TargetHealthInput): TargetHealthReading => {
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

  const readTargetHealth = async (
    port: number, bootId: string, timeoutMs: number, probes: TargetHealthProbes = {}
  ): Promise<TargetHealthReading> => {
    const probe = probes.probe ?? spawnHelper.probeListening
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

  return { classifyTargetHealth, readTargetHealth }
}

export const healthHelper = createHealthHelper()
