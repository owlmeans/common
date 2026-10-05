/** Telling a broken HTTP connection from a refusal, and recovering a long poll that lost one. */
export interface TransportHelper {
  /** A broken HTTP connection, as opposed to a refusal the platform deliberately answered. */
  isTransientTransportError: (value: unknown) => boolean
  /**
   * Recover a long poll with one non-blocking snapshot.
   *
   * Repeating the whole poll can exceed the MCP host's 45-second tool ceiling after a proxy drops a
   * response near the end of its 30-second window. A snapshot asks for the same durable state with
   * no wait, so the caller receives the current state without duplicating or restarting any work.
   */
  recoverLongPoll: <T>(poll: () => Promise<T>, snapshot: () => Promise<T>) => Promise<T>
}
