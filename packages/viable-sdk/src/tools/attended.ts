import { createInflightCalls } from './inflight.js'
import { makeHandoverHelper } from './handover.js'
import { toolHostHelper } from './host.js'
import { ATTEND_ANSWER_MS, ATTEND_REJOIN_MS } from './attended/consts.js'
import type { AttendedCallHelper } from './attended/types.js'
import type { InflightCall, InflightCalls } from './inflight/types.js'
import type { McpToolAnswer, ToolDeps, ToolResult } from './types.js'

export const createAttendedCallHelper = (): AttendedCallHelper => {
  /** The registry of deps that carry none (a tool called directly): one per connector API, so repeats through it join. */
  const registries = new WeakMap<object, InflightCalls>()
  /** When each answer settled — what decides whether a repeat still collects it. */
  const settledAt = new WeakMap<McpToolAnswer, number>()

  const registryOf = (deps: ToolDeps): InflightCalls => {
    if (deps.inflight != null) return deps.inflight
    const known = registries.get(deps.api)
    if (known != null) return known
    const created = createInflightCalls()
    registries.set(deps.api, created)

    return created
  }

  const resultOf = (answer: McpToolAnswer): ToolResult => ({
    text: answer.content.map(part => part.text).join('\n'),
    ...(answer.structuredContent != null ? { structured: answer.structuredContent } : {}),
    ...(answer.isError === true ? { isError: true } : {}),
  })

  /** The answer if it settles within `ms`, else `null` — the call runs on either way. */
  const within = async (call: InflightCall, ms: number): Promise<McpToolAnswer | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([call.done, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms) })])
    } finally {
      clearTimeout(timer)
    }
  }

  const attend: AttendedCallHelper['attend'] = async (deps, { tool, args, run, pending, waitMs = ATTEND_ANSWER_MS }) => {
    // The delegated mode's handover attends every tool already — and joins under this very key.
    if (toolHostHelper.performsModelTasks(deps.host)) return await run()

    const inflight = registryOf(deps)
    const contain = makeHandoverHelper(deps).contain
    const start = (): InflightCall => inflight.join(tool, args, async () => {
      const answer = await contain(tool, run)
      settledAt.set(answer, Date.now())

      return answer
    })
    let call = start()
    // A settled answer nobody collected in time is history: these arguments are a new call now.
    if (call.answer != null && Date.now() - (settledAt.get(call.answer) ?? 0) > ATTEND_REJOIN_MS) {
      inflight.forget(call)
      call = start()
    }

    const answer = await within(call, waitMs)
    if (answer != null) {
      inflight.forget(call)

      return resultOf(answer)
    }
    inflight.release(call)

    return await pending(toolHostHelper.sessionCapable(deps.host))
  }

  return { attend }
}

export const attendedCallHelper = createAttendedCallHelper()
