export interface SetEnvValuesResult {
  /** The file is readable by somebody other than its owner — reported, never silently tightened. */
  insecurePermissions: boolean
}

/** The dotenv-style `~/.owlmeans` credentials file, with the process environment layered over it. */
export interface EnvFileHelper {
  /**
   * Where the credentials file lives: `OWLMEANS_CREDENTIALS`, or `~/.owlmeans`.
   *
   * A CLI that talks to more than one deployment (a staging environment, a self-hosted instance)
   * points this at a different file per deployment — the file is never merged with another one, and
   * a token it holds is meaningless anywhere but the API URL it was signed in against.
   */
  resolveEnvFile: (env?: NodeJS.ProcessEnv) => string
  /**
   * Parse a dotenv-shaped body: `KEY=value`, an optional `export ` prefix, `#` comments, one level
   * of quoting. Deliberately small — a dotenv library would add a dependency for a format this
   * package itself writes, and this is the one shape it ever needs to read back.
   */
  parseEnv: (content: string) => Record<string, string>
  /** The credentials file's values alone, with no environment overlay — what a token is bound to. */
  readCredentialsFile: (env?: NodeJS.ProcessEnv) => Promise<Record<string, string>>
  /**
   * The file, with the process environment layered over it — environment wins, but an environment
   * value that is the EMPTY STRING is treated as unset.
   *
   * The empty-string rule exists because a harness config commonly expands an unset shell variable
   * to `''` (`${VIABLE_API_TOKEN:-}`), and a literal empty override must not shadow a real value the
   * file holds — that would make "I have not set this" indistinguishable from "I am overriding this
   * to nothing", and the file is always the more deliberate of the two.
   */
  loadOwlmeansEnv: (env?: NodeJS.ProcessEnv) => Promise<Record<string, string>>
  /**
   * Replace the named keys in the credentials file, keeping every other line — comments, a key this
   * call did not touch, blank lines — exactly where they were. An `undefined` value removes the key.
   *
   * Written atomically (a temp file in the same directory, then a rename) so a process killed
   * mid-write never leaves a half-written credentials file behind, and created with mode `0600`
   * because this file can hold a live access token. An existing file that is readable by anyone but
   * its owner is reported back rather than silently tightened — permissions someone else set on
   * purpose are theirs to change.
   */
  setEnvValues: (path: string, values: Record<string, string | undefined>) => Promise<SetEnvValuesResult>
}
