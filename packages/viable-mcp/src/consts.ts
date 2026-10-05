import { CONNECT_DEFAULT_API_URL, ConnectLlm, ConnectTarget } from '@owlmeans/viable-common'
import { ENV_API_URL, ENV_HARNESS, ENV_LLM, ENV_MCP_URL, ENV_PROJECT_DIR, ENV_TARGET, ENV_TOKEN } from '@owlmeans/viable-sdk'

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

export const HELP = `viable-mcp — drive the OwlMeans Viable platform from a coding agent

  npx -y @owlmeans/viable-mcp@^0.1.18-rc.44 [options]

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

/**
 * This server's own OAuth client — a static client the platform declares by this exact id
 * (`@owlmeans/server-oauth`'s configuration), so no registration round trip is needed before the
 * very first sign-in.
 */
export const CLIENT_ID = 'viable-mcp'
