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

import { EPHEMERAL_ACTORS, NO_RUNTIME, StoryActor } from './consts.js'
import type { StoryDesignRuntime } from './types.js'
import type { StoryRuntimeHelper } from './runtime/types.js'

export const createStoryRuntimeHelper = (): StoryRuntimeHelper => {
  const isEphemeralActor = (actor?: StoryActor): boolean =>
    actor != null && EPHEMERAL_ACTORS.includes(actor)

  const runtimeOf = (design?: { runtime?: StoryDesignRuntime }): StoryDesignRuntime =>
    design?.runtime ?? NO_RUNTIME

  const needsRuntime = (runtime: StoryDesignRuntime): boolean =>
    runtime.worker || runtime.jobs.length > 0 || runtime.agents.length > 0

  return { isEphemeralActor, runtimeOf, needsRuntime }
}

export const storyRuntimeHelper = createStoryRuntimeHelper()

/** @deprecated compat:factory-refactor — use `storyRuntimeHelper.isEphemeralActor(…)` */
export const isEphemeralActor = (actor?: StoryActor): boolean => storyRuntimeHelper.isEphemeralActor(actor)

/** @deprecated compat:factory-refactor — use `storyRuntimeHelper.runtimeOf(…)` */
export const runtimeOf = (design?: { runtime?: StoryDesignRuntime }): StoryDesignRuntime =>
  storyRuntimeHelper.runtimeOf(design)

/** @deprecated compat:factory-refactor — use `storyRuntimeHelper.needsRuntime(…)` */
export const needsRuntime = (runtime: StoryDesignRuntime): boolean => storyRuntimeHelper.needsRuntime(runtime)
