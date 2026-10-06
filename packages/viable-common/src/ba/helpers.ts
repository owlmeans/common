import type { StoryDraft } from '../areas/types.js'
import { connectingStoryHelper } from './connecting.js'
import type { ConnectingStoryDraft, MergedStoryDraft } from './types.js'

/** @deprecated compat:factory-refactor — use `connectingStoryHelper.connectingStoryCap(…)` */
export const connectingStoryCap = (flowCount: number): number => connectingStoryHelper.connectingStoryCap(flowCount)

/** @deprecated compat:factory-refactor — use `connectingStoryHelper.mergeConnectingStories(…)` */
export const mergeConnectingStories = (flow: StoryDraft[], connecting: ConnectingStoryDraft[]): MergedStoryDraft[] =>
  connectingStoryHelper.mergeConnectingStories(flow, connecting)
