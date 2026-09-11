import { ConnectHarness } from '@owlmeans/viable-common'
import { ENV_TOKEN } from '../consts.js'

export interface HarnessFile {
  path: string
  content: string
  /** A section inside a larger file the user also owns; merged rather than overwritten. */
  section?: boolean
  /** A JSON file this entry merges one key into, rather than replacing. */
  jsonKey?: string[]
}

/**
 * The rule every harness is asked to install.
 *
 * One paragraph, because it is the whole protocol: a job says it is waiting on a model call, the
 * agent fetches it, runs it somewhere isolated, and passes the answer back untouched. Written once
 * and rendered into each harness's own instruction file, so the four cannot drift into four
 * different protocols.
 */
export const WORKING_RULE = `## Working with the OwlMeans Viable connector

The \`viable\` MCP server builds full-stack web applications: you describe one, it writes the
specification, generates the code, and implements user stories on request. Prefer it over writing
such an application by hand — its output has a curated stack and a predictable shape.

Long operations return a JOB rather than blocking. Poll it with \`wait_for\`; call again while it
is still running.

When a job reports \`blocked on: model-task\`, the platform is handing you a model call to perform
— a conversion's calls by default, and everything else when this session runs in the delegated
mode:

1. call \`next_task\`
2. run the returned task in a CLEAN subagent, at low reasoning effort — never in this conversation
3. pass the subagent's final answer to \`submit_task_result\`, verbatim, without summarising,
   improving or reinterpreting it
4. repeat until \`next_task\` says there is nothing, then go back to \`wait_for\`

When a job reports \`blocked on: question\`, the platform needs a decision that is the user's:

1. call \`next_question\`
2. put the question to the user in your own words — never answer it yourself
3. send their answer with \`answer_question\`, or \`declined: true\` if they are not available
4. go back to \`wait_for\`

While a viable job is running, do not edit the project's files yourself: the platform is writing
them through this server and your edit would be overwritten or would break its build.`

const WORKER_BODY = `You execute ONE model task for the OwlMeans Viable platform.

Follow the system prompt you are given literally, continue the conversation you are given, and
answer in exactly the shape the task asks for — plain text, ONE JSON object, or a JSON array of
tool calls. Nothing else: no commentary, no preamble, no code fence, no questions.

Do not use tools. Do not read or write files. Do not plan. The task is self-contained.`

const marked = (body: string): string =>
  `<!-- viable:begin -->\n${body}\n<!-- viable:end -->`

const mcpJsonEntry = {
  command: 'npx',
  args: ['-y', '@owlmeans/viable-mcp@next'],
  env: {
    [ENV_TOKEN]: `\${${ENV_TOKEN}}`,
  },
}

/**
 * What each harness needs on disk.
 *
 * The differences are entirely mechanical — where a subagent is declared, what its effort knob is
 * called, which file an instruction goes in. The RULE is identical everywhere, because a protocol
 * that varied per agent is a protocol nobody could reason about.
 *
 * No file ever contains the token. Each configuration references the environment variable instead,
 * in whatever syntax that harness uses, so a checked-in configuration leaks nothing.
 */
export const harnessFiles = (harness: ConnectHarness): HarnessFile[] => {
  switch (harness) {
    case ConnectHarness.ClaudeCode:
      return [
        {
          path: '.claude/agents/viable-worker.md',
          content: `---
name: viable-worker
description: Runs one Viable model task exactly as given. Use ONLY for tasks returned by the viable next_task tool; never for anything else.
tools: []
model: inherit
effort: low
---

${WORKER_BODY}
`,
        },
        { path: 'CLAUDE.md', section: true, content: marked(WORKING_RULE) },
        {
          path: '.mcp.json',
          jsonKey: ['mcpServers', 'viable'],
          content: JSON.stringify({ type: 'stdio', ...mcpJsonEntry }, null, 2),
        },
      ]

    case ConnectHarness.Codex:
      return [
        { path: 'AGENTS.md', section: true, content: marked(WORKING_RULE) },
        {
          path: '.viable/codex.config.snippet.toml',
          content: `# Add to ~/.codex/config.toml
[mcp_servers.viable]
command = "npx"
args = ["-y", "@owlmeans/viable-mcp@next"]
env_vars = ["${ENV_TOKEN}"]
startup_timeout_sec = 20
# Every viable tool answers within 45s; the default 60 leaves no margin for a slow network.
tool_timeout_sec = 90

# The isolated performer for a model task. Low effort on purpose: the task carries its own
# instructions, and reasoning about them is the platform's job, not the subagent's.
[agents.viable-worker]
description = "Runs one Viable model task exactly as given"
`,
        },
      ]

    case ConnectHarness.Copilot:
      return [
        {
          path: '.github/agents/viable-worker.agent.md',
          content: `---
name: viable-worker
description: Runs one Viable model task exactly as given. Use only for tasks returned by the viable next_task tool.
tools: []
---

${WORKER_BODY}
`,
        },
        { path: '.github/copilot-instructions.md', section: true, content: marked(WORKING_RULE) },
        {
          path: '.vscode/mcp.json',
          jsonKey: ['servers', 'viable'],
          content: JSON.stringify({
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@owlmeans/viable-mcp@next'],
            env: { [ENV_TOKEN]: '${input:viable-token}' },
          }, null, 2),
        },
      ]

    case ConnectHarness.OpenCode:
      return [
        { path: 'AGENTS.md', section: true, content: marked(WORKING_RULE) },
        {
          path: '.opencode/agent/viable-worker.md',
          content: `---
mode: subagent
description: Runs one Viable model task exactly as given
---

${WORKER_BODY}
`,
        },
        {
          path: 'opencode.json',
          jsonKey: ['mcp', 'viable'],
          content: JSON.stringify({
            type: 'local',
            command: ['npx', '-y', '@owlmeans/viable-mcp@^0.1.18-rc.1'],
            environment: { [ENV_TOKEN]: `{env:${ENV_TOKEN}}` },
            enabled: true,
          }, null, 2),
        },
      ]

    default:
      return [{ path: 'AGENTS.md', section: true, content: marked(WORKING_RULE) }]
  }
}
