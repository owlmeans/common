import { ConnectHarness } from '@owlmeans/viable-common'
import { ENV_TOKEN } from '../consts.js'
import { MCP_ARGS, MCP_COMMAND, MCP_EXECUTABLE, MCP_JSON_ENTRY, WORKER_BODY } from './consts.local.js'
import { WORKING_RULE } from './consts.js'
import type { HarnessFile } from './types.js'

const marked = (body: string): string =>
  `<!-- viable:begin -->\n${body}\n<!-- viable:end -->`

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
        { path: 'AGENTS.md', section: true, content: marked(WORKING_RULE) },
        {
          path: '.mcp.json',
          jsonKey: ['mcpServers', 'viable'],
          content: JSON.stringify({ type: 'stdio', ...MCP_JSON_ENTRY }, null, 2),
        },
      ]

    case ConnectHarness.Codex:
      return [
        { path: 'AGENTS.md', section: true, content: marked(WORKING_RULE) },
        {
          path: '.viable/codex.config.snippet.toml',
          content: `# Add to ~/.codex/config.toml
[mcp_servers.viable]
command = ${JSON.stringify(MCP_EXECUTABLE)}
args = ${JSON.stringify(MCP_ARGS)}
# The token is optional — a browser sign-in stores it in ~/.owlmeans, which needs HOME (or
# OWLMEANS_CREDENTIALS) to be found from inside Codex's filtered environment.
env_vars = ["${ENV_TOKEN}", "OWLMEANS_CREDENTIALS", "HOME"]
startup_timeout_sec = 20
# Every viable tool answers within 45s; the default 60 leaves no margin for a slow network.
tool_timeout_sec = 90

# The isolated performer for a model task. Low effort on purpose: the task carries its own
# instructions, and reasoning about them is the platform's responsibility, not the subagent's.
[agents.viable-worker]
description = "Returns only the final answer for one Viable task; the parent supplies its full system prompt, conversation, and output shape"
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
            command: MCP_EXECUTABLE,
            args: MCP_ARGS,
            // No token prompt: signing in with a browser is the default, and a token in the
            // environment or `~/.owlmeans` is picked up without one.
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
            command: [...MCP_COMMAND],
            environment: { [ENV_TOKEN]: `{env:${ENV_TOKEN}}` },
            enabled: true,
          }, null, 2),
        },
      ]

    default:
      return [{ path: 'AGENTS.md', section: true, content: marked(WORKING_RULE) }]
  }
}
