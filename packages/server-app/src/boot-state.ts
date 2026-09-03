import type { ApiPortHoldOptions } from '@owlmeans/server-api'

/**
 * Boot phase of the process.
 *
 * An app binds its port before it initializes, so that a failure has somewhere to be reported
 * from. Without a listener the only thing anyone sees is a connection refused at the edge — an
 * opaque 503 that names neither the app nor the cause. This phase is what the health path answers
 * with, and what the platform reads to tell "still starting" from "gave up, and here is why".
 */
export type BootPhase = 'initializing' | 'ready' | 'failed'

export interface BootHealth extends Record<string, unknown> {
  status: 'OK' | 'FAILED'
  phase: BootPhase
  ok: boolean
  /** Whatever `setBootPhase` was given — the failure message, or the step being waited on. */
  reason?: string
  /**
   * Identity, not health: a supervisor passes the id to the child it spawns and compares it
   * here, so an answer carrying another id means the port is held by a leftover process and the
   * health it reports describes code nobody asked for. Empty when nothing supplied one.
   */
  bootId: string
  pid: number
}

/** Env var a supervisor stamps the spawned process with; surfaced as `bootId`. */
export const BOOT_ID_ENV = 'OWLMEANS_BOOT_ID'

let _phase: BootPhase = 'initializing'
let _detail: string | undefined

export const getBootPhase = (): BootPhase => _phase

export const getBootDetail = (): string | undefined => _detail

/**
 * `detail` is free text, and is kept for every phase — a boot that is merely slow is as worth
 * explaining as one that failed.
 */
export const setBootPhase = (phase: BootPhase, detail?: string): void => {
  _phase = phase
  _detail = detail
}

/**
 * The body the health path answers with, from either server.
 *
 * The port hold and the app's own handler both build it here, so a consumer polling through the
 * handover never sees the shape change under it — which is why the keys are unconditional and
 * only `reason` comes and goes with the state it describes.
 */
export const bootHealthPayload = (): BootHealth => ({
  status: _phase === 'failed' ? 'FAILED' : 'OK',
  phase: _phase,
  ok: _phase === 'ready',
  ...(_detail != null ? { reason: _detail } : {}),
  bootId: process.env[BOOT_ID_ENV] ?? '',
  pid: process.pid
})

/**
 * Hold options wired to this module — the bind-first boot in one line:
 *
 *     const hold = await holdApiPort(ctx.cfg, bootHold(HEALTH_PATH))
 *     try { await init() } catch (e) { setBootPhase('failed', message); return }
 *     await hold.release()
 *     setBootPhase('ready')
 *     await ctx.getApiServer().listen()
 *
 * The hold evaluates `payload` per request, so the phase set after a failure is reported live by
 * the listener that is already bound rather than needing a server that will never start.
 */
export const bootHold = (okPath?: string): ApiPortHoldOptions => ({
  ...(okPath != null ? { okPath } : {}),
  payload: bootHealthPayload
})
