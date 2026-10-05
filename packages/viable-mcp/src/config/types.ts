import type { McpConfig, ParsedArgs } from '../types.js'

/** How this server reads what it was started with: flags, the environment and `~/.owlmeans`. */
export interface ConfigHelper {
  /** The known `--flag value` / `--flag=value` pairs and `--help` of a process argv. */
  parseArgs: (argv: string[]) => ParsedArgs
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
  readConfig: (argv: string[], env: NodeJS.ProcessEnv) => Promise<McpConfig>
}
