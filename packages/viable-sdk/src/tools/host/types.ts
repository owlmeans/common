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
   * Whether the platform's own STORY and FREE-FLIGHT calls are this session's to perform.
   *
   * That is the delegated mode and nothing else, and it needs two things at once — the account
   * setting, and a connector able to drain the tasks it produces. A host that cannot hold a session
   * can never do the draining, whatever the account setting says.
   *
   * It decides WORDING, never a tool list. A conversion hands its model calls to the parent by
   * default on any connector that can hold a session, whatever the account setting says, so
   * `next_task` / `submit_task_result` are offered on {@link ToolHostHelper.sessionCapable} instead —
   * gated here they would leave an ordinary session with a conversion blocked on a task it has no
   * tool to collect.
   */
  performsModelTasks: (host: ToolHost) => boolean
}
