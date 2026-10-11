import type { StoryDraft } from '../../areas/types.js'
import type { ConnectingStoryDraft, MergedStoryDraft } from '../types.js'

/** The connecting stories of a flow: how many it may carry, and where each one lands. */
export interface ConnectingStoryHelper {
  /**
   * How many connecting stories one flow may carry.
   *
   * An N-step chain has N-1 joints, and a connecting story exists to bridge one of them — so the
   * flow sizes its own supporting cast, and a three-step product can never end up with eight list
   * screens. It is a CEILING, not a target: the prompt is told to write as few as its rules actually
   * derived, and most flows land well below this.
   *
   * The real reason for a hard number: every story here becomes a full develop run the project's
   * owner pays for.
   */
  connectingStoryCap: (flowCount: number) => number
  /**
   * Interleave the connecting stories into the flow they were derived from.
   *
   * `after` is an ANCHOR, not a position: it names the flow story whose result the connecting story
   * displays, so the connecting story lands immediately behind it — which is also immediately in
   * front of the step it leads into. The result is ONE ordered list, and it is the order records are
   * created in.
   *
   * This is the only place the anchor is interpreted. Both halves of the feature — the prompt that
   * produces it and the pipeline that persists the result — read it through here, or the two drift
   * and nothing fails loudly enough to notice. The CLAMPED anchor is carried out on each connective
   * entry as `after`, which is what the story card's `follows` relationship is written from.
   *
   * Four properties are deliberate:
   *
   * - **The flow subsequence is never disturbed.** Strip the connecting stories back out and you have
   *   `flow`, in `flow` order: story N still implements numbered step N. Everything that finds the
   *   primary story depends on that.
   * - **Nothing precedes the first flow story.** An anchor below 1 is clamped up rather than opening a
   *   position in front of the flow — nothing can be listed before the step that produced it, and
   *   story 1 stays the enabling action.
   * - **A placement is advice; the story is work already paid for.** An anchor past the end means
   *   "at the end", and one that is not a number at all means the front of the flow. Neither is a
   *   reason to lose a story.
   * - **Ties keep the model's order**, which is the only ranking anything has.
   */
  mergeConnectingStories: (flow: StoryDraft[], connecting: ConnectingStoryDraft[]) => MergedStoryDraft[]
}
