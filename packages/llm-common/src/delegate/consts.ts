/** What the answer must be. */
export enum DelegatedMode {
  /** Prose or code. */
  Text = 'text',
  /** Exactly one JSON object satisfying `outputSchema`. */
  Json = 'json',
  /** A list of calls chosen from `tools`. */
  Tools = 'tools',
  /**
   * A web search the performer runs with ITS OWN search tool — the one kind of task where it is asked
   * to use a tool. The query and its limits are the conversation; the answer is ONE JSON object per
   * `outputSchema`: a {@link DelegatedSearchAnswer}, or a {@link DelegatedSearchRefusal} from a
   * performer that has no web search. Answered with a `Json` result.
   */
  Search = 'search',
}

/** Who a message came from. Deliberately the four roles every chat API agrees on. */
export enum DelegatedRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
}

/** What shape an answer came back in. */
export enum DelegatedResultKind {
  Text = 'text',
  Json = 'json',
  ToolCalls = 'tool-calls',
  /** The performer could not answer. Treated as a malformed answer: asked again, with the reason. */
  Error = 'error',
}
