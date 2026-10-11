import { ConnectHarness, ModelTaskMode, ModelTaskResultKind, type ModelTask } from '@owlmeans/viable-common'
import Ajv from 'ajv'
import { HOW_TO_RUN, ROLE_LABEL, SHAPE } from './consts.local.js'
import type { EnvelopeOptions, ParsedTaskResult } from './types.js'
import type { TaskEnvelopeModel } from './envelope/types.js'

/** Strip a code fence a model wrapped its answer in. */
const unfence = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```')) return trimmed
  const body = trimmed.replace(/^```[a-zA-Z]*\n?/, '')

  return body.replace(/```\s*$/, '').trim()
}

/**
 * Whether an answer satisfies the schema the task asked for, said in words a model can act on.
 *
 * Checked HERE, with the subagent's context still open, rather than left to the platform. A
 * mismatch the platform catches costs a whole round trip, a new task and another wait, and the
 * feedback it sends back is one step removed from the answer that caused it. Checked locally, the
 * parent is told which field is wrong while it can still ask again cheaply.
 *
 * A schema this cannot compile is not a refusal: an answer must never be rejected because of an
 * inability of ours to check it. The platform validates again either way.
 */
const schemaProblem = (task: ModelTask, value: unknown): string | null => {
  if (task.outputSchema == null) return null

  try {
    const validate = new Ajv({ strict: false, allErrors: true }).compile(
      task.outputSchema as Record<string, unknown>
    )
    if (validate(value)) return null

    const said = (validate.errors ?? []).slice(0, 4)
      .map(error => `${error.instancePath === '' ? '(root)' : error.instancePath} ${error.message ?? ''}`)
      .join('; ')

    return `The answer does not match the OUTPUT SCHEMA: ${said}. Send one JSON object that does.`
  } catch {
    return null
  }
}

/**
 * The tool calls an answer carries, or `null` when it carries none.
 *
 * Three shapes rather than one, because models produce three: the documented array, a bare object
 * for a single call, and an array wrapped under `tool_calls`. Assuming the array made a single call
 * read as no call at all.
 */
const toolCallList = (parsed: unknown): unknown[] | null => {
  const wrapper = parsed as { tool_calls?: unknown, toolCalls?: unknown } | null
  if (Array.isArray(parsed)) return parsed.length > 0 ? parsed : null
  if (Array.isArray(wrapper?.tool_calls)) return wrapper.tool_calls
  if (Array.isArray(wrapper?.toolCalls)) return wrapper.toolCalls
  if (typeof (parsed as { name?: unknown })?.name === 'string') return [parsed]

  return null
}

/** One model task handed to a parent agent, and the answer it sends back checked against it. */
export const makeTaskEnvelopeModel = (task: ModelTask): TaskEnvelopeModel => {
  const renderTaskEnvelope = (opts: EnvelopeOptions): string => {
    const model = task.tier != null ? opts.tiers?.[task.tier] : undefined
    const lines: string[] = [
      `=== VIABLE MODEL TASK ${task.id} ===`,
      `role: ${task.role} · tier: ${task.tier}${model != null ? ` → run on: ${model}` : ''}`,
      `mode: ${task.mode} · reasoning: LOW${task.maxOutputChars != null ? ` · answer limit: ${task.maxOutputChars} chars` : ''}`,
      ...(task.attempt > 0
        ? [`This is attempt ${task.attempt + 1}. The previous answer was refused${task.feedback != null ? `: ${task.feedback}` : '.'}`]
        : []),
      '',
      'HOW TO RUN THIS (do not answer it yourself, in this conversation):',
      HOW_TO_RUN[opts.harness] ?? HOW_TO_RUN[ConnectHarness.Other],
      '',
      'WHAT TO SEND BACK — call exactly:',
      `  submit_task_result { "taskId": "${task.id}", "result": <the subagent's final answer> }`,
      SHAPE[task.mode],
      'Do not summarise, improve or reinterpret the answer. Pass it through as it was produced.',
      '',
    ]

    if (task.system != null && task.system !== '') {
      lines.push('--- SYSTEM PROMPT (give this to the subagent as its instructions) ---', task.system, '')
    }

    lines.push('--- CONVERSATION (give this to the subagent, in order) ---')
    for (const message of task.messages) {
      const label = message.name != null
        ? `${ROLE_LABEL[message.role]}:${message.name}`
        : ROLE_LABEL[message.role]
      lines.push(`[${label}] ${message.content}`)
      if (message.toolCalls != null) {
        for (const call of message.toolCalls) {
          lines.push(`[${label} → ${call.name}] ${JSON.stringify(call.args)}`)
        }
      }
    }
    lines.push('')

    if (task.mode === ModelTaskMode.Tools && task.tools != null) {
      lines.push('--- TOOLS THE SUBAGENT MAY CALL ---', JSON.stringify(task.tools, null, 2), '')
    }
    if (task.mode === ModelTaskMode.Json && task.outputSchema != null) {
      lines.push('--- OUTPUT SCHEMA ---', JSON.stringify(task.outputSchema, null, 2), '')
    }

    lines.push(`=== END TASK ${task.id} ===`)

    return lines.join('\n')
  }

  const parseTaskResult = (raw: unknown): ParsedTaskResult => {
    if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
      return { problem: 'The answer was empty. Run the task and send what the subagent produced.' }
    }

    if (task.mode === ModelTaskMode.Text) {
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw)

      return { result: { taskId: task.id, kind: ModelTaskResultKind.Text, text } }
    }

    let parsed: unknown = raw
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(unfence(raw))
      } catch {
        if (task.mode === ModelTaskMode.Json) {
          return {
            problem: 'The answer was not valid JSON. Send ONE JSON object matching the schema, with no prose and no code fence.',
          }
        }

        // Prose in a tools-mode task is not a malformed answer: it is how a model with tools bound
        // says it is finished. Refusing it stalls the agent loop it was ending — every attempt gives
        // the same reply and the run dies of exhausted retries with nothing wrong anywhere.
        return { result: { taskId: task.id, kind: ModelTaskResultKind.Text, text: raw } }
      }
    }

    if (task.mode === ModelTaskMode.Json) {
      if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
        return { problem: 'The answer must be a single JSON object, not an array or a scalar.' }
      }

      const invalid = schemaProblem(task, parsed)
      if (invalid != null) return { problem: invalid }

      return { result: { taskId: task.id, kind: ModelTaskResultKind.Json, json: parsed } }
    }

    const listed = toolCallList(parsed)
    if (listed == null) {
      // Valid JSON that names no tool call — treated as the model's final say, for the same reason
      // prose is. What it may NOT do is name a tool that does not exist, which is checked below.
      return {
        result: {
          taskId: task.id,
          kind: ModelTaskResultKind.Text,
          text: typeof raw === 'string' ? raw : JSON.stringify(raw),
        },
      }
    }

    const known = new Set((task.tools ?? []).map(tool => tool.name))
    const calls = []
    for (const entry of listed) {
      const call = entry as { name?: unknown, args?: unknown }
      if (typeof call.name !== 'string') {
        return { problem: 'Every tool call needs a "name". ' + JSON.stringify(entry) }
      }
      if (known.size > 0 && !known.has(call.name)) {
        return {
          problem: `"${call.name}" is not one of the tools this task offers (${[...known].join(', ')}).`,
        }
      }
      calls.push({ name: call.name, args: (call.args ?? {}) as Record<string, unknown> })
    }

    return { result: { taskId: task.id, kind: ModelTaskResultKind.ToolCalls, toolCalls: calls } }
  }

  return { task, renderTaskEnvelope, parseTaskResult }
}
