import path from 'node:path'
import { ConnectHarness, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import { ENV_API_URL, ENV_HARNESS, ENV_LLM, ENV_PROJECT_DIR, ENV_TARGET, ENV_TOKEN, resolveMcpUrl } from '@owlmeans/viable-sdk'
import { FLAGS } from './consts.local.js'
import { DEFAULT_API_URL, DEFAULT_LLM, DEFAULT_TARGET } from './consts.js'
import type { McpConfig, ParsedArgs } from './types.js'
import type { ConfigHelper } from './config/types.js'
import { envFileHelper } from '@owlmeans/cli-auth'

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  value != null && (allowed as readonly string[]).includes(value) ? value as T : fallback

export const createConfigHelper = (): ConfigHelper => {
  const parseArgs = (argv: string[]): ParsedArgs => {
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

  const readConfig = async (argv: string[], env: NodeJS.ProcessEnv): Promise<McpConfig> => {
    const { values } = parseArgs(argv)
    const merged = await envFileHelper.loadOwlmeansEnv(env)
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

  return { parseArgs, readConfig }
}

export const configHelper = createConfigHelper()
