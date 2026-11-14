import { ModelTaskRole, ConnectHarness, ModelTaskMode } from '@owlmeans/viable-common'
import { CONFIRM_NO, CONFIRM_YES } from './consts.js'

export const ROLE_TO_LC: Record<ModelTaskRole, string> = {
  [ModelTaskRole.System]: 'system',
  [ModelTaskRole.User]: 'user',
  [ModelTaskRole.Assistant]: 'assistant',
  // A chat model called without the tool definitions cannot receive a tool turn; the content is
  // what mattered anyway, and presenting it as a user turn keeps the conversation readable.
  [ModelTaskRole.Tool]: 'user',
}

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
export const HOW_TO_RUN: Record<ConnectHarness, string> = {
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
    + 'produce only the answer in the required shape, and nothing else. Give the worker the SYSTEM\n'
    + 'PROMPT first, then the CONVERSATION in order, then the shape rule below. Do not pass this\n'
    + 'outer HOW TO RUN or submit_task_result instruction to the worker: only the parent submits its\n'
    + 'final answer. A text task returns the requested text or source, never a JSON tool-call array;\n'
    + 'that array is only valid in tools mode. Take the worker\'s final message verbatim.',
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

export const SHAPE: Record<ModelTaskMode, string> = {
  [ModelTaskMode.Text]: 'The answer is plain text. Send it as the `result` string, verbatim.',
  [ModelTaskMode.Json]:
    'The answer must be ONE JSON object matching the OUTPUT SCHEMA below — no prose, no code fence,\n'
    + 'no explanation. Send it as `result`.',
  [ModelTaskMode.Tools]:
    'Answer with a JSON array of tool calls chosen from the TOOLS below, each\n'
    + '{"name": "...", "args": {...}} — nothing else around it. If no tool call is needed and the\n'
    + 'work is done, answer in plain text instead: that is how the caller learns the turn is over.\n'
    + 'Send whichever it is as `result`.',
  [ModelTaskMode.Search]:
    'The answer must be ONE JSON object matching the OUTPUT SCHEMA below —\n'
    + '{"text": "<the answer, Markdown>", "sources": [{"url": "https://…", "title": "…", "snippet": "…"}],\n'
    + '"queries": ["<what was searched>"]}, or {"unavailable": true} from a worker with no web search —\n'
    + 'no prose, no code fence. Send it as `result`.',
}

/**
 * The rule a SEARCH task carries for its worker: the one task kind in which the worker uses a tool —
 * and must. Rendered right under the header, so a parent that stops reading early still knows this
 * worker needs its web search, and handed to the worker with its instructions (`SEARCH_HANDOFF`).
 * Every other mode keeps the worker tool-less.
 */
export const SEARCH_RULE =
  'WEB SEARCH TASK — the worker MUST search the web with ITS OWN web search tool. This is the one task\n'
  + 'kind in which a tool is allowed: the web search tool, and the web fetch tool to open a result whose\n'
  + 'snippet is not enough — nothing else, no files. Search for the query in the CONVERSATION within the\n'
  + 'limits it states (searches, sources, domains, location), then write the answer from the pages found.\n'
  + 'Name only pages the search actually returned, by their http(s) URL — never a page from memory. A\n'
  + 'worker with no web search tool answers {"unavailable": true} and nothing else.'

/** What a parent is told to pass on with a SEARCH task, after the harness's own HOW TO RUN. */
export const SEARCH_HANDOFF =
  'This task needs a worker WITH a web search tool: give it the WEB SEARCH TASK rule above together\n'
  + 'with the SYSTEM PROMPT — it is what allows the worker its web search. Do not search or answer here.'


export const ROLE_LABEL: Record<ModelTaskRole, string> = {
  [ModelTaskRole.System]: 'system',
  [ModelTaskRole.User]: 'user',
  [ModelTaskRole.Assistant]: 'assistant',
  [ModelTaskRole.Tool]: 'tool',
}

/** What a parent may send for a confirm question, beyond the two values themselves. */
export const CONFIRM_WORDS: Record<string, string> = {
  yes: CONFIRM_YES,
  y: CONFIRM_YES,
  true: CONFIRM_YES,
  ok: CONFIRM_YES,
  no: CONFIRM_NO,
  n: CONFIRM_NO,
  false: CONFIRM_NO,
}

/** Why the reference parent (`makeModelTaskDriver`) refuses a search task: a chat model has no web search. */
export const DRIVER_NO_SEARCH = 'the reference parent is a chat model without a web search tool'
