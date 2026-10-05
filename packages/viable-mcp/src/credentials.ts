import { makeCliCredentials, type CliCredentials } from '@owlmeans/cli-auth'
import { ENV_API_URL, ENV_TOKEN } from '@owlmeans/viable-sdk'
import type { McpConfig } from './types.js'
import { CLIENT_ID } from './consts.js'

/** One credential holder per configuration — `bin.ts`'s `login`/`logout`/`status` and `server.ts`
 * build it the same way, so they can never disagree about which file or which API URL a token
 * belongs to. */
export const makeCredentials = (cfg: McpConfig, log: (line: string) => void): CliCredentials =>
  makeCliCredentials({
    apiUrl: cfg.apiUrl,
    clientId: CLIENT_ID,
    tokenEnvKey: ENV_TOKEN,
    apiUrlEnvKey: ENV_API_URL,
    onNotify: log,
  })
