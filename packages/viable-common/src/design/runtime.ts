/**
 * What a story needs BEYOND a screen, an endpoint and a table — and the standing answer is
 * "nothing".
 *
 * A generated application has a worker process, a broker and the packages to run LLM agents inside
 * it, and every one of those is a real cost paid by a real user: a queue turns one request into
 * two processes and a message that can be delivered twice, and an agent turns a click into a bill.
 * The template ships all three, so the question a design stage has to answer is not "can it" but
 * "does this story genuinely require it". The default of every field here is the answer that costs
 * nothing.
 *
 * This block is the whole vocabulary. The implementation steps that write jobs, worker processors
 * and agents are gated on it and skip entirely when it is absent, so a story that needs none of it
 * emits exactly the tree it emitted before any of this existed.
 */

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

export const isEphemeralActor = (actor?: StoryActor): boolean =>
  actor != null && EPHEMERAL_ACTORS.includes(actor)

/** One queued unit of work. */
export interface StoryDesignJob {
  /** The queue it is enqueued onto. */
  queue: string
  /** The job name, which IS its entrypoint alias — `app.job.<name>`. */
  name: string
  /** The processor module, relative to the worker package's `src`. */
  path: string
  /** What it does, in one sentence, for the coder that writes the processor. */
  purpose: string
  /**
   * Why it may not run on the request path.
   *
   * Recorded because it is the thing a later run has to be able to disagree with. "It might be
   * slow" is not a reason; "it calls a model" and "it walks every row of a table the user owns"
   * are.
   */
  reason: string
  /**
   * Whether running it twice is safe, and how it was made so.
   *
   * A worker can die mid-job; the lock expires and the step re-runs. There is no way to make that
   * automatic, so the answer is written down where the processor's author has to read it.
   */
  idempotency: string
}

/** An LLM agent or pipeline generated INTO the target. */
export interface StoryDesignAgent {
  /** Its alias in the target's own agent registry. */
  alias: string
  /** The module, relative to the shared backend package's `src`. */
  path: string
  /** What it is for. */
  purpose: string
  /** Which of the three shapes this is — a call, a pipeline, or a tool-using agent. */
  kind: StoryAgentKind
  /** The job that runs it — an agent is never invoked on the request path. */
  job?: string
}

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

/**
 * The gate, as the design stage recorded it.
 *
 * Absent on a design written before this existed, and read as "none of it" everywhere — which is
 * both the safe answer and the true one for every story developed until now.
 */
export interface StoryDesignRuntime {
  actor: StoryActor
  /** Whether this story puts work on the queue at all. */
  worker: boolean
  jobs: StoryDesignJob[]
  agents: StoryDesignAgent[]
  /**
   * Whether this story's data belongs in the key/value store rather than in Postgres.
   *
   * Postgres is the default and being wrong with it is cheap. This is true only for data with an
   * expiry, a lock, a counter or a fan-out, and a bounded, namespaced key set.
   */
  kv: boolean
  /**
   * Which HUMAN story shows the progress of this story's queued work.
   *
   * An ephemeral actor cannot report to anybody: there is no screen it owns and no session it runs
   * in. A story that enqueues work therefore names the story whose screen carries the job feed, and
   * the permission to enqueue and to watch is granted to that area's role.
   */
  feedback?: string
}

/** What a design carries when nobody has asked the question — and when the answer was "no". */
export const NO_RUNTIME: StoryDesignRuntime = {
  actor: StoryActor.Human,
  worker: false,
  jobs: [],
  agents: [],
  kv: false,
}

/** Read the gate off a design, total over a design that predates it. */
export const runtimeOf = (design?: { runtime?: StoryDesignRuntime }): StoryDesignRuntime =>
  design?.runtime ?? NO_RUNTIME

/** Whether anything at all was asked for — the one check every new step is gated on. */
export const needsRuntime = (runtime: StoryDesignRuntime): boolean =>
  runtime.worker || runtime.jobs.length > 0 || runtime.agents.length > 0
