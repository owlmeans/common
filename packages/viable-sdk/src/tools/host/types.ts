import type { ToolHost } from '../types.js'

/**
 * What a tool host can do — the predicates a catalogue entry's `availability` names, and the
 * wording decisions that depend on the same facts.
 */
export interface ToolHostHelper {
  anyHost: () => boolean
  localTarget: (host: ToolHost) => boolean
  cloudTarget: (host: ToolHost) => boolean
  withExecutor: (host: ToolHost) => boolean
  delegatedLlm: (host: ToolHost) => boolean
  /**
   * Whether this host can hold a connector SESSION across calls.
   *
   * A session is a connector ATTACHED: a process that stays, drains the project's operations and
   * keeps the model tasks handed to it until the parent agent answers them. The stdio server is
   * exactly that. The URL-configured host answers one request and forgets — opening a session there
   * would claim the project's single connector slot, supersede the connector legitimately holding
   * it, and be abandoned before the first operation was delivered.
   */
  sessionCapable: (host: ToolHost) => boolean
  /**
   * Whether this session performs the platform's model calls — every one of them: project drafting,
   * content checks, story formatting, every run's calls and a conversion's.
   *
   * That is the delegated mode and nothing else, and it needs two things at once — the delegated
   * llm, and a connector able to drain the tasks it produces. A host that cannot hold a session can
   * never do the draining, whatever the llm says. In the cloud mode the platform performs all of
   * them, so the task loop (`next_task` / `submit_task_result`) is offered on exactly this predicate,
   * and so is the handover a blocked tool answers with.
   */
  performsModelTasks: (host: ToolHost) => boolean
}
