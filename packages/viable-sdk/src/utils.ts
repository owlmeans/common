import { DEFAULT_MCP_URL, ENV_MCP_URL } from './consts.js'

/**
 * The `/mcp` URL a person, a doc or a verification tool should use: the value the merged
 * configuration names (environment over `~/.owlmeans`, already resolved by the caller), else the
 * production default. An empty value counts as unset, and a trailing slash is dropped — a
 * canonical resource URI (RFC 8707) has one spelling.
 */
export const resolveMcpUrl = (values: Record<string, string | undefined>): string => {
  const named = values[ENV_MCP_URL]

  return (named != null && named !== '' ? named : DEFAULT_MCP_URL).replace(/\/+$/, '')
}
