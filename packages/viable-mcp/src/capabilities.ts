import { ConnectExecutor, ConnectTarget } from '@owlmeans/viable-common'
import type { ConnectCapabilities } from '@owlmeans/viable-common'
import type { McpConfig } from './config.js'

/**
 * What this connector tells the platform it is able to do.
 *
 * Kept out of the server so it can be read — and tested — without a platform to open a session
 * against, because what is advertised here is the only thing the platform goes by: an executor
 * claimed by mistake is an operation queued for a connector that will never answer it, and one
 * omitted by mistake is a run that quietly does without.
 *
 * An executor states what this connector CAN do, never what the platform must ask of it. So the
 * three disk executors follow the TARGET — a cloud project's files are not on this machine — while
 * `Model` and `Human` are advertised ALWAYS, in every mode: a parent coding agent is a model with
 * a person in front of it by definition, which is the whole reason the platform can hand it either
 * kind of work.
 *
 * WHO PAYS is decided elsewhere, per kind of work, and never from this list. The platform's own
 * story and free-flight calls follow `session.llm` — the route the session attached through, which
 * carries the paid delegated capability. A CONVERSION follows its own setting (`converterLlmMode`),
 * whose floor is "a live session advertises `Model`" — so gating `Model` on `llm=local` made that
 * floor unreachable for an ordinary free session and silently moved every conversion onto the
 * platform's models, which is the opposite of the default.
 */
export const sessionCapabilities = (cfg: McpConfig): ConnectCapabilities => {
  const local = cfg.target === ConnectTarget.Local

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
      ConnectExecutor.Model,
      ConnectExecutor.Human,
    ],
  }
}
