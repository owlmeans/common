import { ConnectHarness, ModelTaskMode, ModelTaskResultKind, ModelTaskRole } from '@owlmeans/viable-common'
import type { ModelTask, ModelTaskResult } from '@owlmeans/viable-common'
import Ajv from 'ajv'

/**
 * How each parent agent is told to run a task in a CLEAN subagent.
 *
 * The instruction differs per harness only in the mechanism — which tool spawns a subagent, what
 * the effort knob is called — never in what is being asked. A harness with no subagent mechanism
 * Every one of them carries the inline fallback, which is the same request with the isolation
 * stated rather than enforced. None may assert that the worker EXISTS: `install_harness` is what
 * writes it, nothing in the flow requires that to have been run, and a block that names a file as
 * a fact sends a literal agent to a subagent type it does not have — on the first task, before it
 * has done anything.
 */
const HOW_TO_RUN: Record<ConnectHarness, string> = {
  [ConnectHarness.ClaudeCode]:
    'Use the Agent tool with subagent_type "viable-worker", which install_harness writes to\n'
    + '.claude/agents/viable-worker.md with effort: low. If that subagent is not installed, either\n'
    + 'call install_harness now or answer INLINE: reason minimally and produce only the answer.\n'
    + 'Give the worker the SYSTEM PROMPT as its opening instruction, then the CONVERSATION in\n'
    + 'order, then the shape rule below. Take its final message verbatim.',
  [ConnectHarness.Codex]:
    'Spawn a subagent with the "viable-worker" role, which install_harness writes to config.toml\n'
    + 'as `[agents.viable-worker]` with a low model_reasoning_effort. If it is not installed or\n'
    + 'your session has no subagents, answer the task INLINE in a single reply: reason minimally,\n'
    + 'produce only the answer in the required shape, and nothing else.',
  [ConnectHarness.Copilot]:
    'Delegate to the "viable-worker" custom agent, which install_harness writes to\n'
    + '.github/agents/viable-worker.agent.md. If it is not installed or delegation is\n'
    + 'unavailable, answer the task INLINE in a single reply: reason minimally and produce only\n'
    + 'the answer in the required shape.',
  [ConnectHarness.OpenCode]:
    'Invoke the `viable-worker` subagent (@viable-worker, or the Task tool), which install_harness\n'
    + 'writes to .opencode/agent/viable-worker.md. If it is not installed, answer INLINE instead:\n'
    + 'reason minimally and produce only the answer. Give the worker the SYSTEM PROMPT, then the\n'
    + 'CONVERSATION, then the shape rule below.',
  [ConnectHarness.Other]:
    'Run this in a fresh, isolated context — not in this conversation. Reason minimally. Produce\n'
    + 'only the answer in the required shape.',
}

const SHAPE: Record<ModelTaskMode, string> = {
  [ModelTaskMode.Text]: 'The answer is plain text. Send it as the `result` string, verbatim.',
  [ModelTaskMode.Json]:
    'The answer must be ONE JSON object matching the OUTPUT SCHEMA below — no prose, no code fence,\n'
    + 'no explanation. Send it as `result`.',
  [ModelTaskMode.Tools]:
    'Answer with a JSON array of tool calls chosen from the TOOLS below, each\n'
    + '{"name": "...", "args": {...}} — nothing else around it. If no tool call is needed and the\n'
    + 'work is done, answer in plain text instead: that is how the caller learns the turn is over.\n'
    + 'Send whichever it is as `result`.',
}

const ROLE_LABEL: Record<ModelTaskRole, string> = {
  [ModelTaskRole.System]: 'system',
  [ModelTaskRole.User]: 'user',
  [ModelTaskRole.Assistant]: 'assistant',
  [ModelTaskRole.Tool]: 'tool',
}

export interface EnvelopeOptions {
  harness: ConnectHarness
  /** What the parent said it would run each tier on. Display only. */
  tiers?: Partial<Record<string, string>>
}

/**
 * What `next_task` hands the parent agent.
 *
 * Text rather than a structure, because the reader is a language model working from a tool result:
 * it has to be able to act on this without a schema in front of it. Everything it must do is
 * stated in order — how to run it, what to call afterwards, what shape the answer takes — before
 * the material itself, so a model that stops reading early has still read the instruction.
 *
 * The task id appears at the top and in the follow-up call on purpose. It is the only thing that
 * routes an answer back, and a parent that paraphrases the rest but copies the id still works.
 */
export const renderTaskEnvelope = (task: ModelTask, opts: EnvelopeOptions): string => {
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

/** Strip a code fence a model wrapped its answer in. */
const unfence = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```')) return trimmed
  const body = trimmed.replace(/^```[a-zA-Z]*\n?/, '')

  return body.replace(/```\s*$/, '').trim()
}

export interface ParsedTaskResult {
  result?: ModelTaskResult
  /** Present when the answer did not match what was asked. Quoted back to the parent verbatim. */
  problem?: string
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

/**
 * Check a parent's answer against what the task asked for, before the platform ever sees it.
 *
 * The refusal is worth more than the parse. A malformed answer that reaches the platform costs a
 * whole retry — another task, another subagent, another wait — while one caught here is a sentence
 * the parent can act on immediately, with the subagent's context still open. So a failure comes
 * back as a `problem`, not as a thrown error, and the caller renders it as a tool error the model
 * reads and corrects.
 */
export const parseTaskResult = (
  task: ModelTask, raw: unknown
): ParsedTaskResult => {
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
