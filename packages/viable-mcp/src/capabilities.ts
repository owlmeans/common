import { ConnectExecutor, ConnectLlm, ConnectTarget, type ConnectCapabilities } from '@owlmeans/viable-common'
import type { McpConfig } from './types.js'

/**
 * What this connector tells the platform it is able to do.
 *
 * Kept out of the server so it can be read — and tested — without a platform to open a session
 * against, because what is advertised here is the only thing the platform goes by: an executor
 * claimed by mistake is an operation queued for a connector that will never answer it, and one
 * omitted by mistake is a run that quietly does without.
 *
 * An executor states what this connector CAN do. The three disk executors follow the TARGET — a
 * cloud project's files are not on this machine. `Model` follows the LLM: it is advertised exactly
 * when `llm` is `local`, because that flag is the one switch for who performs the platform's model
 * calls — in the delegated mode every one of them is this connector's parent's, and in the cloud
 * mode none is, a conversion's included, so a cloud connector that claimed `Model` would be handed
 * calls it was never started to perform. `Human` is advertised ALWAYS: a parent coding agent has a
 * person in front of it by definition, which is the whole reason the platform can ask one anything.
 */
export const sessionCapabilities = (cfg: McpConfig): ConnectCapabilities => {
  const local = cfg.target === ConnectTarget.Local
  const delegated = cfg.llm === ConnectLlm.Local

  return {
    harness: cfg.harness,
    // Empty rather than guessed: a tier's entry is the parent's OWN name for the model it runs
    // that tier on, which a configuration on this side cannot know. Nothing may read it as a
    // capability either — it is `{}` on every session this server opens.
    tiers: {},
    subagents: true,
    effortControl: true,
    executors: [
      ...(local ? [ConnectExecutor.Files, ConnectExecutor.Shell, ConnectExecutor.Git] : []),
      ...(delegated ? [ConnectExecutor.Model] : []),
      ConnectExecutor.Human,
    ],
  }
}
