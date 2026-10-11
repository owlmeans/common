/**
 * The text of a `.env` file: parsed, and the platform's managed block rewritten inside it while
 * every line the user wrote survives.
 */
export interface DotenvHelper {
  /**
   * Parse a `.env` body.
   *
   * Deliberately small: `KEY=value`, an optional `export ` prefix, `#` comments, and one level of
   * quoting. A dotenv library would add a dependency for a format the platform itself writes, and
   * anything it understands that this does not is something the target's own runtime would have to
   * understand too.
   */
  parseEnv: (content: string) => Record<string, string>
  /** The file with the platform's block cut out — everything the user wrote, and only that. */
  outsideManagedBlock: (existing: string) => string
  /**
   * Stand down from every key the user has assigned themselves.
   *
   * "Everything outside the block is yours" has to be true of the VALUES, not only of the lines. A
   * `.env` gives the last assignment of a key, and the block is appended, so a platform line silently
   * outranked whatever the user wrote above it — `DATABASE_URL` included, which is the one value the
   * platform cannot supply and the setup guide tells people to write themselves. The result was an
   * application connecting to the placeholder no matter what its owner put in the file.
   *
   * A yielded key is replaced by a comment rather than dropped, so the file says why the platform is
   * not setting something it normally would.
   */
  yieldToUser: (existing: string, content: string) => string
  /**
   * Replace what sits between the markers, and nothing else.
   *
   * A BEGIN with no END — a file truncated mid-write, or hand-edited — is rewritten to the end of
   * the file rather than left alone: the alternative is a block that grows a second copy of itself
   * on every push, and the text after a lost END was the platform's anyway.
   */
  replaceManagedBlock: (existing: string, content: string) => string
}
