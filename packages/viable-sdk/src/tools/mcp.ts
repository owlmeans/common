import { TOOL_DEADLINE_MS } from '../consts.js'
import { catalogueHelper } from './catalogue.js'
import { HANDOVER_EXEMPT } from './consts.local.js'
import { makeHandoverHelper } from './handover.js'
import { createInflightCalls } from './inflight.js'
import { toolHostHelper } from './host.js'
import { instructionsHelper } from './instructions.js'
import { makeToolProfileModel } from './profile.js'
import { refusalHelper } from './refusal.js'
import type { ToolDeps, McpServerLike, McpToolAnswer } from './types.js'

const withDeadline = async <T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} took longer than ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}

/**
 * Put the catalogue on an MCP server.
 *
 * Two things every handler gets, and both are about the host rather than the tool. A deadline,
 * because a tool that outlives its host's ceiling is reported to the user as a broken server
 * rather than as a slow platform. And containment: a thrown error becomes an `isError` result the
 * model can read and act on, because an exception crossing the transport tells it only that
 * something went wrong somewhere.
 *
 * In the delegated mode a platform call may itself stop for a model call this session's parent
 * performs — the parent that is blocked on this very tool. There a tool is the HANDOVER instead of
 * a deadline: its call races a model task arriving, the task is answered first, and the call's own
 * result is delivered by `submit_task_result` / `next_task` once it settles. The task loop and the
 * tools that never reach the platform keep the deadline.
 */
export const registerCatalogue = (server: McpServerLike, deps: ToolDeps): string[] => {
  const registered: string[] = []
  // The host's profile — or none, where nothing below changes what a tool is or answers.
  const profile = makeToolProfileModel(deps.host.profile)
  // What a profile rewrites in an answer it rewrites in a notification too: the same refusal reaches both.
  const notifying: ToolDeps = deps.notify != null && profile.profile?.text != null
    ? { ...deps, notify: (level, text) => deps.notify!(level, profile.text(text)) }
    : deps
  // One registry for the life of the server, shared by every tool through the deps it is handed.
  const toolDeps: ToolDeps = notifying.inflight != null ? notifying : { ...notifying, inflight: createInflightCalls() }
  const handover = makeHandoverHelper(toolDeps)
  const delegated = toolHostHelper.performsModelTasks(toolDeps.host)

  /**
   * A tool's answer as the profile presents it. A presenter that throws is a defect: its text is
   * answered as an error — the MCP server would refuse a success without its declared shape and
   * replace the text with its own validation message.
   */
  const presented = (tool: string, answer: McpToolAnswer, args: Record<string, unknown>): McpToolAnswer => {
    try {
      return profile.answer(tool, answer, args)
    } catch (e) {
      toolDeps.log(`${tool} presentation failed: ${refusalHelper.refusalMessage(e)}`)

      return { content: answer.content, isError: true }
    }
  }

  for (const tool of catalogueHelper.visibleTools(toolDeps.host)) {
    const output = profile.presentationOf(tool.name)?.output
    const call = async (args: Record<string, unknown>): Promise<McpToolAnswer> => delegated && !HANDOVER_EXEMPT.has(tool.name)
      ? await handover.run(tool, args ?? {})
      : await handover.contain(tool.name, async () =>
        await withDeadline(tool.name, TOOL_DEADLINE_MS, async () => await tool.run(args ?? {}, toolDeps)))
    server.registerTool(
      tool.name,
      {
        title: tool.title, description: tool.description, inputSchema: tool.input, annotations: tool.annotations,
        ...(output != null ? { outputSchema: output } : {}),
      },
      profile.profile == null ? call : async (args: Record<string, unknown>) => presented(tool.name, await call(args), args ?? {})
    )
    registered.push(tool.name)
  }

  return registered
}

/**
 * What the server tells a parent agent about itself, before any tool is called.
 *
 * A host with a profile answers the profile's own instructions, given the names it actually offers;
 * every other host the base text (`instructionsHelper.compose`), which names no tool the host hides.
 */
export const serverInstructions = (deps: Pick<ToolDeps, 'host'>): string => {
  const { host } = deps
  if (host.profile != null) {
    return host.profile.instructions({ host, offered: catalogueHelper.visibleTools(host).map(tool => tool.name) })
  }

  return instructionsHelper.compose(host)
}
