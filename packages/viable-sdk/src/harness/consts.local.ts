import { ENV_TOKEN } from '../consts.js'

export const BEGIN = '<!-- viable:begin -->'

export const END = '<!-- viable:end -->'

export const WORKER_BODY = `You execute ONE model task for the OwlMeans Viable platform.

Follow the system prompt you are given literally, continue the conversation you are given, and
answer in exactly the shape the task asks for — plain text, ONE JSON object, or a JSON array of
tool calls. Nothing else: no commentary, no preamble, no code fence, no questions.

Do not use tools. Do not read or write files. Do not plan. The task is self-contained.`

/**
 * The one command every harness starts the MCP server with — written ONCE, on one line with its
 * `npx`, so the release pin audit reads it as an install command and moves the caret with every
 * viable-mcp release. A tag (`@next`) is refused by that audit, and a copy per harness was how three
 * of four configs kept a tag while the fourth carried the pin.
 */
export const MCP_COMMAND = ['npx', '-y', '@owlmeans/viable-mcp@^0.1.18-rc.43'] as const

export const MCP_EXECUTABLE = MCP_COMMAND[0]

export const MCP_ARGS: string[] = MCP_COMMAND.slice(1)

/**
 * The token is OPTIONAL in every harness configuration (`templates.ts`): a person who signed in once
 * (`viable-mcp login`, or the first tool call's browser sign-in) has it in `~/.owlmeans`, and the
 * server reads it from there. So a reference to the variable must not break a machine that never
 * set one — Claude Code fails to load a config whose `\${VAR}` is unset, hence the empty default
 * (which the server treats as unset: a file value is never shadowed by an empty environment one).
 */
export const MCP_JSON_ENTRY = {
  command: MCP_EXECUTABLE,
  args: MCP_ARGS,
  env: {
    [ENV_TOKEN]: `\${${ENV_TOKEN}:-}`,
  },
}
