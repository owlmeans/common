import type { BaseMessage } from '@langchain/core/messages'
import type { JSONSchemaType } from 'ajv'
import type { LlmModel } from '@owlmeans/llm'
import { AgentRunStatus, DEFAULT_ADVICE_CHARS, DEFAULT_SUMMARY_CHARS, truncateAt } from '@owlmeans/agent-common'

export interface Compaction {
  summary: string
  advice?: string
}

export interface CompactionInput {
  /** Omit to skip the model entirely and take the deterministic path. */
  model?: LlmModel
  /** The ask that opened the run. */
  prompt: string
  messages: readonly BaseMessage[]
  status: AgentRunStatus
  /** What happened after the loop — a validation verdict, a build result. */
  note?: string
  maxSummaryChars?: number
  maxAdviceChars?: number
  /** LangChain `runName`. Give it a value the application filters, or the summary of a run streams into the user's view of that run. */
  action?: string
  /** How much of the transcript to show the model. */
  maxTranscriptChars?: number
}

const DEFAULT_TRANSCRIPT_CHARS = 24_000

/** The text of a message, whatever content shape it arrived in. */
export const messageText = (message: BaseMessage): string => {
  const content = message.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map(part => typeof part === 'string' ? part : (part as { text?: string }).text ?? '')
      .filter(text => text !== '')
      .join('\n')
  }

  return ''
}

/**
 * A transcript the model can read, newest-biased.
 *
 * The tail is what matters to a compaction — how the run ENDED decides what to do next — so when
 * the budget binds it is the head that goes.
 */
export const renderTranscript = (
  messages: readonly BaseMessage[], maxChars = DEFAULT_TRANSCRIPT_CHARS,
): string => {
  const lines: string[] = []
  let used = 0

  for (let i = messages.length - 1; i >= 0; --i) {
    const message = messages[i]
    const text = messageText(message).trim()
    const calls = (message as { tool_calls?: Array<{ name: string }> }).tool_calls
    const body = text !== ''
      ? text
      : calls != null && calls.length > 0
        ? `(called ${calls.map(call => call.name).join(', ')})`
        : ''
    if (body === '') {
      continue
    }

    const line = `${message.getType()}: ${body}`
    if (used + line.length > maxChars) {
      break
    }
    lines.unshift(line)
    used += line.length
  }

  return lines.join('\n\n')
}

const COMPACTION_SCHEMA: JSONSchemaType<{ summary: string, advice: string }> = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    advice: { type: 'string' },
  },
  required: ['summary', 'advice'],
  additionalProperties: false,
}

/**
 * Compact a finished run into what the next one needs.
 *
 * Two parts, deliberately. A summary alone leaves the next run to re-derive the plan from the
 * outcome, which is where it invents a different one; the advice is the half that carries intent
 * across the gap.
 *
 * **Never throws, and never trusts the model's arithmetic.** The character caps are applied after
 * the answer comes back, because a cap in a prompt is a request. When the model is absent or fails
 * — an exhausted budget is the common case, and asking again would fail the same way — the
 * deterministic fallback still produces a usable event: what was asked, and how it ended.
 */
export const composeCompaction = async (input: CompactionInput): Promise<Compaction> => {
  const {
    model, prompt, messages, status, note,
    maxSummaryChars = DEFAULT_SUMMARY_CHARS,
    maxAdviceChars = DEFAULT_ADVICE_CHARS,
    action = 'agent-compaction',
    maxTranscriptChars,
  } = input

  const fallback = (): Compaction => {
    const last = [...messages].reverse().find(message => messageText(message).trim() !== '')
    const tail = last != null ? messageText(last).trim() : ''
    const head = `Asked: ${prompt.trim()}`
    const ended = status === AgentRunStatus.Ok ? 'Finished.' : 'Did not finish.'

    return {
      summary: truncateAt(
        [head, ended, note?.trim(), tail].filter(part => part != null && part !== '').join(' '),
        maxSummaryChars,
      ),
    }
  }

  if (model == null) {
    return fallback()
  }

  try {
    const result = await model.invoke<{ summary: string, advice: string }>(
      `
Compact the conversation below into a handover for the next session working on the same subject.

Write two things:

- summary: what was asked, what was actually done, and how it ended. Facts only — name the files,
  decisions and failures that occurred. At most ${maxSummaryChars} characters.
- advice: what the next session should do first, and what it should not repeat. If the work
  finished cleanly, say what remains or say that nothing does. At most ${maxAdviceChars} characters.

Write for a reader who cannot see this conversation and will act on your words alone. Do not
address the reader, do not describe the conversation as a conversation, and do not speculate about
anything not shown.

# The ask that opened the session
${prompt}

# How it ended
${status === AgentRunStatus.Ok ? 'Completed' : 'Failed'}${note != null && note !== '' ? ` — ${note}` : ''}

# Conversation
${renderTranscript(messages, maxTranscriptChars)}
      `,
      COMPACTION_SCHEMA,
      { action },
    )

    const summary = truncateAt(result.summary ?? '', maxSummaryChars)
    const advice = truncateAt(result.advice ?? '', maxAdviceChars)

    // An empty summary is a non-answer, not a short one — take the deterministic path rather than
    // storing a blank event that the next run will read as "nothing happened".
    return summary === ''
      ? fallback()
      : { summary, ...(advice !== '' ? { advice } : {}) }
  } catch (e) {
    console.warn('Agent compaction failed, falling back to a deterministic summary:', e)
    return fallback()
  }
}
