import type { ModelTask } from '@owlmeans/viable-common'
import { HANDOVER_WAIT_MS } from '../consts.js'
import type { SessionRuntime } from '../types.js'
import { makeTaskEnvelopeModel } from '../task/envelope.js'
import { HANDOVER_SLICE_MS, STATUS_TOOL_OF } from './consts.local.js'
import { createInflightCalls } from './inflight.js'
import { refusalHelper } from './refusal.js'
import type { InflightCall, InflightCalls } from './inflight/types.js'
import type { HandoverCollection, HandoverHelper } from './handover/types.js'
import type { McpToolAnswer, ToolDefinition, ToolDeps, ToolResult } from './types.js'

const textOf = (answer: McpToolAnswer): string => answer.content.map(part => part.text).join('\n')

const namesOf = (calls: InflightCall[]): string => [...new Set(calls.map(call => call.tool))].join(', ')

/** A wait that ends at `ms` or when `signal` aborts, whichever comes first. */
const pause = async (ms: number, signal: AbortSignal): Promise<void> => await new Promise(resolve => {
  const timer = setTimeout(resolve, ms)
  signal.addEventListener('abort', () => {
    clearTimeout(timer)
    resolve()
  }, { once: true })
})

/**
 * @param deps The tool deps; their `inflight` registry is the one every handover of this server
 *   shares. A deps bag without one (a test calling a tool directly) gets a private, empty one.
 */
export const makeHandoverHelper = (deps: ToolDeps): HandoverHelper => {
  const inflight: InflightCalls = deps.inflight ?? createInflightCalls()

  const answerOf = (result: ToolResult): McpToolAnswer => ({
    content: [{ type: 'text' as const, text: result.text }],
    ...(result.structured != null ? { structuredContent: result.structured } : {}),
    ...(result.isError === true ? { isError: true } : {}),
  })

  const contain = async (tool: string, run: () => Promise<ToolResult>): Promise<McpToolAnswer> => {
    try {
      return answerOf(await run())
    } catch (e) {
      // The balance, the spend consent and a conversion's confirmation are refusals only a
      // PERSON resolves: phrased from their packed fields (never the raw marker) and pushed out
      // of band as well, where the host has a channel for it.
      const person = refusalHelper.personRefusalPhrase(e)
      const text = person ?? refusalHelper.refusalPhrase(e)
      deps.log(`${tool} failed: ${refusalHelper.refusalMessage(e)}`)
      if (person != null) {
        deps.notify?.('warning', text)
      }

      return { content: [{ type: 'text' as const, text }], isError: true }
    }
  }

  const envelopeOf = (task: ModelTask): string =>
    makeTaskEnvelopeModel(task).renderTaskEnvelope({ harness: deps.host.harness })

  const statusToolOf = (tool: string): string => STATUS_TOOL_OF[tool] ?? 'project_status'

  const run = async (tool: ToolDefinition, args: Record<string, unknown>): Promise<McpToolAnswer> => {
    const call = inflight.join(tool.name, args, async () => await contain(tool.name, async () => await tool.run(args, deps)))
    const deadline = Date.now() + HANDOVER_WAIT_MS

    // In slices: the session to watch may not exist yet, or may be replaced while the call runs —
    // a delegated create opens its unattached session from inside the very call waited on here.
    while (Date.now() < deadline) {
      const session = deps.currentSession()
      const stop = new AbortController()
      const slice = Math.min(HANDOVER_SLICE_MS, deadline - Date.now())
      const outcome = await Promise.race([
        call.done.then(() => 'done' as const),
        session != null
          ? session.taskAvailable(slice, stop.signal).then(ready => ready ? 'task' as const : 'tick' as const)
          : pause(slice, stop.signal).then(() => 'tick' as const),
      ])
      stop.abort()

      if (outcome === 'done') {
        inflight.forget(call)

        return call.answer!
      }
      if (outcome === 'task' && session != null) {
        const task = await session.nextTask(0)
        // Another caller was quicker — the race goes on.
        if (task == null) continue
        inflight.release(call)

        return answerOf({
          text: `${tool.name} is NOT finished — the platform is waiting on a model call you must`
            + ` perform. Do not call ${tool.name} again. Run the task below in a clean subagent at LOW`
            + ' reasoning effort, then call submit_task_result {taskId, result}; its reply is'
            + ` ${tool.name}'s result, or the next model call it waits on.\n\n`
            + envelopeOf(task),
          structured: { taskId: task.id, waitingOn: tool.name },
        })
      }
    }

    inflight.release(call)

    return answerOf({
      text: `${tool.name} is still running on the platform — call next_task (or read`
        + ` ${statusToolOf(tool.name)}). Calling ${tool.name} again with the same arguments waits on`
        + ' the same call rather than starting another.',
      structured: { running: tool.name },
    })
  }

  const collect = async (session: SessionRuntime, waitMs: number): Promise<HandoverCollection> => {
    const stop = new AbortController()
    await Promise.race([
      inflight.settled(waitMs, stop.signal),
      session.taskAvailable(waitMs, stop.signal),
    ])
    stop.abort()

    return {
      settled: inflight.drainSettled(),
      task: await session.nextTask(0),
      running: inflight.running(),
    }
  }

  const report = (collected: HandoverCollection, lead?: string): ToolResult | null => {
    const { settled, task, running } = collected
    if (settled.length < 1 && task == null && running.length < 1) return null

    const parts: string[] = lead != null ? [lead] : []
    for (const call of settled) {
      const answer = call.answer!
      parts.push(`--- ${call.tool} ${answer.isError === true ? 'was refused' : 'finished'} ---\n${textOf(answer)}`)
    }
    if (task != null) {
      parts.push(
        (running.length > 0
          ? `The next model call to perform (${namesOf(running)} still running on the platform):`
          : 'The next model call to perform:')
        + `\n\n${envelopeOf(task)}`
      )
    } else if (running.length > 0) {
      parts.push(`${namesOf(running)} still running on the platform — call next_task (or read`
        + ` ${statusToolOf(running[0]!.tool)}).`)
    }

    return {
      text: parts.join('\n\n'),
      structured: {
        settled: settled.map(call => ({
          tool: call.tool,
          text: textOf(call.answer!),
          ...(call.answer!.isError === true ? { isError: true } : {}),
        })),
        ...(task != null ? { taskId: task.id } : {}),
        ...(running.length > 0 ? { running: running.map(call => call.tool) } : {}),
      },
    }
  }

  const pending = (): boolean => inflight.running().length > 0 || inflight.hasSettled()

  return { run, contain, collect, report, pending }
}
