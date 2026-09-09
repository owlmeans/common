import type { StoryDraft } from "../areas/types.js"
import type { ConnectingStoryDraft, MergedStoryDraft } from "./types.js"
import { StoryKind } from "./consts.js"

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
export const connectingStoryCap = (flowCount: number): number => Math.max(flowCount - 1, 0)

/** Collapse case and whitespace, so "the same story twice" is recognised as such. */
const canonical = (story: string): string => story.trim().replace(/\s+/g, ' ').toLowerCase()

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
 * and nothing fails loudly enough to notice.
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
export const mergeConnectingStories = (
  flow: StoryDraft[], connecting: ConnectingStoryDraft[]
): MergedStoryDraft[] => {
  if (flow.length < 1) {
    return []
  }

  const seen = new Set(flow.map(({ story }) => canonical(story)))
  const placed: Array<{ draft: ConnectingStoryDraft, at: number }> = []

  for (const draft of connecting) {
    const text = canonical(draft.story)
    // A connecting story that repeats a flow story is not a second story: it is one develop run
    // spent twice AND — since the home-screen detector matches its answer back by exact text — a
    // second record that answer could resolve to.
    if (text === '' || seen.has(text)) {
      continue
    }
    seen.add(text)

    const after = Number(draft.after)
    placed.push({
      draft,
      at: Number.isFinite(after) ? Math.min(Math.max(Math.trunc(after), 1), flow.length) : 1,
    })
  }

  // Over the cap, the LATEST-anchored go: a story late in the flow gates the fewest steps behind
  // it, while the queue that hands step 1 to step 2 is what makes everything after it reachable.
  // The sort is stable, so two stories on the same step keep the order they were derived in.
  const surviving = placed
    .map((entry, order) => ({ ...entry, order }))
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .slice(0, connectingStoryCap(flow.length))

  // Bucket N holds what comes immediately after flow story N (1-based, as the prompt numbers them).
  const buckets: ConnectingStoryDraft[][] = flow.map(() => [])
  for (const { draft, at } of surviving) {
    buckets[at - 1]!.push(draft)
  }

  return flow.flatMap(({ story, area }, index) => [
    { story, area, kind: StoryKind.Flow },
    ...buckets[index]!.map(draft => (
      { story: draft.story.trim(), area: draft.area, kind: StoryKind.Connective }
    )),
  ])
}
