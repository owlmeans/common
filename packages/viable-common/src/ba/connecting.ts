import type { StoryDraft } from "../areas/types.js"
import type { ConnectingStoryDraft, MergedStoryDraft } from "./types.js"
import { StoryKind } from "./consts.js"
import type { ConnectingStoryHelper } from './connecting/types.js'

export const createConnectingStoryHelper = (): ConnectingStoryHelper => {
  const connectingStoryCap = (flowCount: number): number => Math.max(flowCount - 1, 0)

  /** Collapse case and whitespace, so "the same story twice" is recognised as such. */
  const canonical = (story: string): string => story.trim().replace(/\s+/g, ' ').toLowerCase()

  const mergeConnectingStories = (
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
        { story: draft.story.trim(), area: draft.area, kind: StoryKind.Connective, after: index + 1 }
      )),
    ])
  }

  return { connectingStoryCap, mergeConnectingStories }
}

export const connectingStoryHelper = createConnectingStoryHelper()
