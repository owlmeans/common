/**
 * The blueprint the platform ships and every project uses until something says otherwise.
 *
 * A string rather than an enum: a blueprint may be registered by a consumer, and an enum would
 * make the platform's own list the closed set of everything that can exist — which is the shape
 * this whole abstraction was introduced to remove.
 */
export const DEFAULT_BLUEPRINT_ID = 'owlmeans-fullstack-ts'

/** Recorded on a project so a later run knows which blueprint drew it. */
export const BLUEPRINT_META_KEY = 'blueprint'

/**
 * WHICH KIND of product is being built on a blueprint.
 *
 * A blueprint says what the STACK is — the language, the framework, the topology, the seeds. A
 * case says what is being built ON it, and that is a different question with different consumers:
 * the analyst framing the brief, the architect deciding whether a story needs a queue, the coder
 * choosing which packages it may import.
 *
 * Deliberately NOT a second blueprint. Everything a case has to say is already a blueprint field,
 * so a case is a PATCH and the resolution order stays base → case → per-run overrides. That is
 * also why adding one is a data change: nothing reads `BlueprintCase` except the case table
 * (`BLUEPRINT_CASES` in `@owlmeans/viable`) and the prompt that classifies a project into it.
 */
export enum BlueprintCase {
  /** A web application whose every feature fits inside a request. No queue, no worker, no agents. */
  Web = 'web',
  /** A web application with work that genuinely belongs off the request path. */
  Scalable = 'scalable',
  /** The product's value comes from ordered, deterministic model-driven steps. */
  AiPipeline = 'ai-pipeline',
  /** The product's value comes from an agent that decides its own path through tools. */
  AiAgent = 'ai-agent',
  /** A browser game: a three.js scene with an ordinary React interface over it. */
  Game = 'game',
}

/**
 * How a game is played, which decides who owns its state.
 *
 * Recorded beside the case rather than folded into it, because it changes nothing about the
 * dependencies and everything about where the logic goes. `OnlineTurn` is the default for
 * anything multiplayer unless the brief plainly asks for live play — it is the shape that
 * actually builds, and it needs no socket, no tick loop and no reconciliation.
 */
export enum GameKind {
  Casual = 'casual',
  OnlineTurn = 'online-turn',
  OnlineLive = 'online-live',
}
