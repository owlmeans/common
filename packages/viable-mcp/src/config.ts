import path from 'node:path'
import { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import {
  ENV_API_URL, ENV_HARNESS, ENV_LLM, ENV_PROJECT_DIR, ENV_TARGET, ENV_TOKEN
} from '@owlmeans/viable-sdk'

/**
 * The public deployment, for a user who set nothing.
 *
 * Overridden by `VIABLE_API_URL` for a self-hosted or development platform, which is what every
 * end-to-end test does.
 */
export const DEFAULT_API_URL = 'https://vib-api.owlmeans.org'

/** target=local, llm=cloud: the project on the user's machine, the model calls paid by the platform. */
export const DEFAULT_TARGET = ConnectTarget.Local
export const DEFAULT_LLM = ConnectLlm.Cloud

export interface McpConfig {
  apiUrl: string
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
 * The token comes from the environment ONLY, never from an argument: a command line is readable by
 * every process on the machine and lands in shell history, and a credential that leaks that way
 * leaks silently. Everything else may be a flag, because everything else is a preference.
 */
export const readConfig = (argv: string[], env: NodeJS.ProcessEnv): McpConfig => {
  const { values } = parseArgs(argv)
  const token = env[ENV_TOKEN] ?? ''

  return {
    apiUrl: values['api-url'] ?? env[ENV_API_URL] ?? DEFAULT_API_URL,
    token,
    target: oneOf(values.target ?? env[ENV_TARGET], Object.values(ConnectTarget), DEFAULT_TARGET),
    llm: oneOf(values.llm ?? env[ENV_LLM], Object.values(ConnectLlm), DEFAULT_LLM),
    harness: oneOf(
      values.harness ?? env[ENV_HARNESS], Object.values(ConnectHarness), ConnectHarness.Other
    ),
    projectDir: path.resolve(values['project-dir'] ?? env[ENV_PROJECT_DIR] ?? process.cwd()),
    ...(values.http != null ? { httpPort: Number(values.http) } : {}),
  }
}

export const HELP = `viable-mcp — drive the OwlMeans Viable platform from a coding agent

  npx -y @owlmeans/viable-mcp [options]

Options
  --api-url <url>       The platform's API. Default: ${DEFAULT_API_URL}
  --target local|cloud  Where the generated project lives. Default: ${DEFAULT_TARGET}
  --llm cloud|local     Who performs the model calls. Default: ${DEFAULT_LLM}
  --harness <name>      claude-code | codex | copilot | opencode
  --project-dir <path>  The local project directory. Default: the working directory
  --http <port>         Serve over HTTP instead of stdio (development)
  --help

Environment
  ${ENV_TOKEN}     REQUIRED. Your access token, created in the platform's account screen.
  ${ENV_API_URL}       Same as --api-url
  ${ENV_TARGET}        Same as --target
  ${ENV_LLM}           Same as --llm
  ${ENV_HARNESS}       Same as --harness
  ${ENV_PROJECT_DIR}   Same as --project-dir

The token is read from the environment only — never from a command line, which is readable by
every process on the machine.
`
