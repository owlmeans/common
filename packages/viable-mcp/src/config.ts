import path from 'node:path'
import { loadOwlmeansEnv } from '@owlmeans/cli-auth'
import {
  CONNECT_DEFAULT_API_URL, ConnectHarness, ConnectLlm, ConnectTarget
} from '@owlmeans/viable-common'
import {
  ENV_API_URL, ENV_HARNESS, ENV_LLM, ENV_MCP_URL, ENV_PROJECT_DIR, ENV_TARGET, ENV_TOKEN, resolveMcpUrl
} from '@owlmeans/viable-sdk'

/**
 * The public deployment, for a user who set nothing — the same host the default `/mcp` URL is on
 * (`CONNECT_DEFAULT_MCP_URL`), so the npx server and the URL host never default to two platforms.
 *
 * Overridden by `VIABLE_API_URL` for a self-hosted or development platform, which is what every
 * end-to-end test does.
 */
export const DEFAULT_API_URL = CONNECT_DEFAULT_API_URL

/** target=local, llm=cloud: the project on the user's machine, the model calls paid by the platform. */
export const DEFAULT_TARGET = ConnectTarget.Local
export const DEFAULT_LLM = ConnectLlm.Cloud

export interface McpConfig {
  apiUrl: string
  /** The URL-configured host's address — printed by `viable-mcp url`; this server never calls it. */
  mcpUrl: string
  token: string
  target: ConnectTarget
  llm: ConnectLlm
  harness: ConnectHarness
  projectDir: string
  /** Serve over HTTP on this port instead of stdio. Development only. */
  httpPort?: number
}

export interface ParsedArgs {
  help?: boolean
  values: Record<string, string>
}

const FLAGS = ['api-url', 'target', 'llm', 'harness', 'project-dir', 'http']

export const parseArgs = (argv: string[]): ParsedArgs => {
  const values: Record<string, string> = {}
  let help = false

  for (let i = 2; i < argv.length; ++i) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      help = true
      continue
    }
    if (!arg.startsWith('--')) continue
    const [name, inline] = arg.slice(2).split('=', 2)
    if (!FLAGS.includes(name)) continue
    values[name] = inline ?? argv[++i] ?? ''
  }

  return { help, values }
}

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  value != null && (allowed as readonly string[]).includes(value) ? value as T : fallback

/**
 * What this server was started with.
 *
 * The token comes from `~/.owlmeans` (or `OWLMEANS_CREDENTIALS`) and the environment, NEVER from
 * an argument: a command line is readable by every process on the machine and lands in shell
 * history, and a credential that leaks that way leaks silently. The environment always wins over
 * the file — `loadOwlmeansEnv` is where that precedence, and the empty-string exception for a
 * harness's unexpanded `${VIABLE_API_TOKEN:-}`, actually lives. Everything else may be a flag,
 * because everything else is a preference.
 *
 * A missing token is no longer fatal here — `cfg.token === ''` means "not signed in yet", and the
 * credential holder built from this config signs in lazily on first use.
 */
export const readConfig = async (argv: string[], env: NodeJS.ProcessEnv): Promise<McpConfig> => {
  const { values } = parseArgs(argv)
  const merged = await loadOwlmeansEnv(env)
  const token = merged[ENV_TOKEN] ?? ''

  return {
    apiUrl: values['api-url'] ?? merged[ENV_API_URL] ?? DEFAULT_API_URL,
    mcpUrl: resolveMcpUrl(merged),
    token,
    target: oneOf(values.target ?? merged[ENV_TARGET], Object.values(ConnectTarget), DEFAULT_TARGET),
    llm: oneOf(values.llm ?? merged[ENV_LLM], Object.values(ConnectLlm), DEFAULT_LLM),
    harness: oneOf(
      values.harness ?? merged[ENV_HARNESS], Object.values(ConnectHarness), ConnectHarness.Other
    ),
    projectDir: path.resolve(values['project-dir'] ?? merged[ENV_PROJECT_DIR] ?? process.cwd()),
    ...(values.http != null ? { httpPort: Number(values.http) } : {}),
  }
}

export const HELP = `viable-mcp — drive the OwlMeans Viable platform from a coding agent

  npx -y @owlmeans/viable-mcp@^0.1.18-rc.28 [options]

Options
  --api-url <url>       The platform's API. Default: ${DEFAULT_API_URL}
  --target local|cloud  Where the generated project lives. Default: ${DEFAULT_TARGET}
  --llm cloud|local     Who performs the model calls. Default: ${DEFAULT_LLM}
  --harness <name>      claude-code | codex | copilot | opencode
  --project-dir <path>  The local project directory. Default: the working directory
  --http <port>         Serve over HTTP instead of stdio (development)
  --help

Commands
  login                  Sign in with your browser and store the token in ~/.owlmeans
  logout                 Revoke the stored token and forget it
  status                 Report whether this machine is signed in (stderr only)
  url                    Print the platform's /mcp URL for a URL-configured host (stdout)

Environment
  ${ENV_TOKEN}       Your access token. Optional — omit it and run \`login\` once instead.
  ${ENV_API_URL}         Same as --api-url
  ${ENV_MCP_URL}         The /mcp URL \`url\` prints. Default: https://api.owlmeans.com/mcp
  ${ENV_TARGET}          Same as --target
  ${ENV_LLM}             Same as --llm
  ${ENV_HARNESS}         Same as --harness
  ${ENV_PROJECT_DIR}     Same as --project-dir
  OWLMEANS_CREDENTIALS   Path to the credentials file. Default: ~/.owlmeans

The token is read from the environment or from ~/.owlmeans — never from a command line, which is
readable by every process on the machine. The environment always wins over the file. With neither
set, the server starts anyway and signs in on first use, opening your browser.
`
