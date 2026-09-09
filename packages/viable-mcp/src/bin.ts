#!/usr/bin/env node
// FIRST, before anything that might log: stdout belongs to the protocol.
import { protocolStdout } from './stdout-guard.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ENV_TOKEN } from '@owlmeans/viable-sdk'
import { HELP, parseArgs, readConfig } from './config.js'
import { makeViableMcpServer } from './server.js'
import { serveHttp } from './http.js'

const main = async (): Promise<number> => {
  const { help } = parseArgs(process.argv)
  if (help) {
    process.stderr.write(HELP)

    return 0
  }

  const cfg = readConfig(process.argv, process.env)
  if (cfg.token === '') {
    process.stderr.write(
      `${ENV_TOKEN} is not set.\n\n`
      + 'Create an access token in the platform\'s account screen, then start this server with it\n'
      + `in the environment. See mcp.md for the exact configuration for your coding agent.\n`
    )

    return 2
  }

  const { server, close } = await makeViableMcpServer(cfg)
  const log = (line: string): void => { process.stderr.write(`[viable-mcp] ${line}\n`) }

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

main().then(code => {
  if (code !== 0) process.exit(code)
}).catch((e: unknown) => {
  process.stderr.write(`fatal: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
