import { readFileSync } from 'node:fs'

const PACKAGE_NAME = '@owlmeans/viable-mcp'
const UNKNOWN_VERSION = '0.0.0'

/**
 * The version this server reports to a host (`serverInfo.version`) and files with its connector
 * session (`clientVersion`) — read from the package's own manifest, never written beside it.
 *
 * The manifest is the one file the release harness bumps and npm always ships, so the reported
 * version cannot lag a release, which a literal constant beside the code did for a whole line of
 * published candidates. `src/version.ts` and `build/version.js` both sit one directory below the
 * manifest, so the same relative URL answers in a test run over sources and in the packaged server.
 * The name is checked so a relocated build can never report some other package's version, and an
 * unreadable manifest reports `0.0.0` rather than stopping a server whose only job is the protocol.
 */
const readVersion = (): string => {
  try {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      name?: unknown
      version?: unknown
    }
    if (manifest.name === PACKAGE_NAME && typeof manifest.version === 'string' && manifest.version !== '') {
      return manifest.version
    }
  } catch {
    // An unreadable manifest is not a reason to refuse a host; the version is informational.
  }

  return UNKNOWN_VERSION
}

export const VERSION: string = readVersion()
