import type { ConnectingUserStoryDraft } from "./types.js"
import { UserStoryKind } from "./consts.js"
import type { ConnectingUserStoryHelper } from './connecting/types.js'

export const createConnectingUserStoryHelper = (): ConnectingUserStoryHelper => {
  const connectingUserStoryCap = (flowCount: number): number => Math.max(flowCount - 1, 0)

  /** Collapse case and whitespace, so "the same story twice" is recognised as such. */
  const canonical = (userStory: string): string => userStory.trim().replace(/\s+/g, ' ').toLowerCase()

  const mergeConnectingUserStories: ConnectingUserStoryHelper['mergeConnectingUserStories'] = (flow, connecting) => {
    if (flow.length < 1) {
      return []
    }

    const seen = new Set(flow.map(({ story: userStory }) => canonical(userStory)))
    const placed: Array<{ draft: ConnectingUserStoryDraft, at: number }> = []

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
      .slice(0, connectingUserStoryCap(flow.length))

    // Bucket N holds what comes immediately after flow story N (1-based, as the prompt numbers them).
    const buckets: Array<Array<ConnectingUserStoryDraft>> = flow.map(() => [])
    for (const { draft, at } of surviving) {
      buckets[at - 1]!.push(draft)
    }

    return flow.flatMap((draft, index) => [
      { story: draft.story, area: draft.area, kind: UserStoryKind.Flow },
      ...buckets[index]!.map(connecting => (
        { story: connecting.story.trim(), area: connecting.area, kind: UserStoryKind.Connective, after: index + 1 }
      )),
    ])
  }

  return { connectingUserStoryCap, mergeConnectingUserStories }
}

export const connectingUserStoryHelper = createConnectingUserStoryHelper()
