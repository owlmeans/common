/**
 * The design shape's own version.
 *
 * A mismatch REFUSES; it never adapts. A design is read back days after it was written, by code
 * that has since changed — and a reader that "adapted" an older shape would be guessing which of
 * the fields it is missing were absent because they had not been designed and which because the
 * shape did not have them yet. Those are different questions with different answers.
 */
import type { StoryDesignRuntime } from './types.js'

export const STORY_DESIGN_VERSION = 1

/** How far a design may drift from the project it was written against before it is stale. */
export enum DesignStaleness {
  /** Usable as it stands. */
  Fresh = 'fresh',
  /** Written under another shape version. Refuse. */
  Version = 'version',
  /** The story's own narrative changed. Re-design. */
  Narrative = 'narrative',
  /** The project's specification, vision or design system changed. Warn and continue. */
  Project = 'project',
  /** The generated tree moved under it. Re-run the stages that read the tree. */
  Tree = 'tree',
}

/** Who acts in a story. */
export enum StoryActor {
  /** A person, in one of the four areas. Every story until something says otherwise. */
  Human = 'human',
  /**
   * The application's own LLM agent.
   *
   * An EPHEMERAL role: it holds no permissions and has no area of its own, because there is nobody
   * to sign in as it. A story belongs to it when the work is the agent's — the human half is a
   * separate, paired story that starts the work and watches it.
   */
  Agent = 'agent',
  /** A queue consumer. Ephemeral in exactly the same sense. */
  Worker = 'worker',
}

/** The ephemeral actors — those a permission may never be granted to. */
export const EPHEMERAL_ACTORS: StoryActor[] = [StoryActor.Agent, StoryActor.Worker]

/**
 * The three shapes that can perform work with a model, cheapest first.
 *
 * They are not interchangeable and the difference is who decides the order. A CALL is one prompt
 * and one answer; a PIPELINE runs steps this application named in advance; an AGENT is handed
 * tools and works out its own path. Each step up buys capability with latency, money and a
 * failure mode, so the right answer is the simplest shape that does the job — and for most work
 * that asks for a model at all, it is a call.
 */
export enum StoryAgentKind {
  /** One prompt, one answer, optionally schema-shaped. The default. */
  Call = 'call',
  /** Ordered steps decided by the application, not by the model. */
  Pipeline = 'pipeline',
  /** The model chooses its own path through the tools it was given. */
  Agent = 'agent',
}

/** What a design carries when nobody has asked the question — and when the answer was "no". */
export const NO_RUNTIME: StoryDesignRuntime = {
  actor: StoryActor.Human,
  worker: false,
  jobs: [],
  agents: [],
  kv: false,
}
