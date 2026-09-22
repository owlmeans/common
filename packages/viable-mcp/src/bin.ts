#!/usr/bin/env node
// FIRST, before anything that might log: stdout belongs to the protocol.
import { protocolStdout } from './stdout-guard.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { HELP, parseArgs, readConfig } from './config.js'
import { makeCredentials } from './credentials.js'
import { makeViableMcpServer } from './server.js'
import { serveHttp } from './http.js'

const log = (line: string): void => { process.stderr.write(`[viable-mcp] ${line}\n`) }

/** `viable-mcp login` — sign in with a browser, right now, and report the result. Exactly the
 * device sign-in a tool call would trigger lazily, run to completion up front so a person setting
 * this up for the first time gets an immediate answer instead of a wait buried in their agent's
 * first tool call. */
const login = async (argv: string[]): Promise<number> => {
  const cfg = await readConfig(argv, process.env)
  const credentials = makeCredentials(cfg, log)

  if ((await credentials.token()) != null) {
    log(`already signed in for ${cfg.apiUrl}`)

    return 0
  }

  try {
    // No wait ceiling worth imposing here — this command's whole purpose is to wait, and a person
    // running it interactively will simply see the same "sign in at…" line the timeout would
    // have repeated anyway.
    await credentials.require(15 * 60 * 1000)
    log('signed in.')

    return 0
  } catch (e) {
    log(`sign-in failed: ${e instanceof Error ? e.message : String(e)}`)

    return 1
  }
}

/** `viable-mcp logout` — revoke and forget the stored token. */
const logout = async (argv: string[]): Promise<number> => {
  const cfg = await readConfig(argv, process.env)
  const credentials = makeCredentials(cfg, log)
  await credentials.signOut()
  log(`signed out of ${cfg.apiUrl}`)

  return 0
}

/** `viable-mcp url` — print the platform's `/mcp` address, for `claude mcp add --transport http
 * viable "$(npx -y @owlmeans/viable-mcp@^0.1.18-rc.29 url)"`. The ONE command whose answer belongs on stdout: no
 * protocol runs in this mode, and a caller capturing it must get the bare URL and nothing else. */
const url = async (argv: string[]): Promise<number> => {
  const cfg = await readConfig(argv, process.env)
  protocolStdout.write(`${cfg.mcpUrl}\n`)

  return 0
}

/** `viable-mcp status` — report, on stderr only, whether this machine can already authenticate. */
const status = async (argv: string[]): Promise<number> => {
  const cfg = await readConfig(argv, process.env)
  const credentials = makeCredentials(cfg, log)
  const token = await credentials.token()
  log(token != null ? `signed in for ${cfg.apiUrl}` : `not signed in for ${cfg.apiUrl} — run \`viable-mcp login\``)

  return 0
}

const serve = async (argv: string[]): Promise<number> => {
  const cfg = await readConfig(argv, process.env)
  const { server, close } = await makeViableMcpServer(cfg)

  let stopHttp: (() => Promise<void>) | null = null
  const shutdown = (): void => {
    void (async () => {
      await stopHttp?.().catch(() => undefined)
      await close().catch(() => undefined)
    })().finally(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  if (cfg.httpPort != null) {
    // The development transport, so a process that issues one command per turn can drive this
    // server without restarting it — and supersede its own connector session — on every call.
    stopHttp = await serveHttp(server, cfg.httpPort, log)

    return 0
  }

  // The transport is handed the one stream that reaches the real stdout; everything else in the
  // process has been redirected to stderr.
  await server.connect(new StdioServerTransport(process.stdin, protocolStdout))

  return 0
}

const main = async (): Promise<number> => {
  const { help } = parseArgs(process.argv)
  if (help) {
    process.stderr.write(HELP)

    return 0
  }

  // A subcommand is the first bare argument — everything after `node bin.js` that is not itself
  // a flag. Absent, this is the server, exactly as it always was.
  const command = process.argv[2]
  switch (command) {
    case 'login':
      return await login(process.argv)
    case 'logout':
      return await logout(process.argv)
    case 'status':
      return await status(process.argv)
    case 'url':
      return await url(process.argv)
    default:
      return await serve(process.argv)
  }
}

main().then(code => {
  if (code !== 0) process.exit(code)
}).catch((e: unknown) => {
  process.stderr.write(`fatal: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
