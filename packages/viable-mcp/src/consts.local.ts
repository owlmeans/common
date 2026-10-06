export const FLAGS = ['api-url', 'target', 'llm', 'harness', 'project-dir', 'http']

/**
 * Well inside `TOOL_DEADLINE_MS` (45 s): a tool call that trips this waits this long for an
 * already-pending sign-in to finish before it gives up and reports `SignInRequired`, leaving room
 * for the round trip the platform call itself still needs to make once a token exists.
 */
export const SIGN_IN_WAIT_MS = 20_000

export const PACKAGE_NAME = '@owlmeans/viable-mcp'

export const UNKNOWN_VERSION = '0.0.0'
