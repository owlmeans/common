import { makeCliCredentials } from '@owlmeans/cli-auth'
import type { CliCredentials } from '@owlmeans/cli-auth'
import { ENV_API_URL, ENV_TOKEN } from '@owlmeans/viable-sdk'
import type { McpConfig } from './config.js'

/**
 * This server's own OAuth client — a static client the platform declares by this exact id
 * (`@owlmeans/server-oauth`'s configuration), so no registration round trip is needed before the
 * very first sign-in.
 */
export const CLIENT_ID = 'viable-mcp'

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
