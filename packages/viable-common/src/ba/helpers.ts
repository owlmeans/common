import type { WorkcardDraft } from '../areas/types.js'
import { connectingUserStoryHelper } from './connecting.js'
import type { ConnectingUserStoryDraft, MergedUserStoryDraft } from './types.js'

/** @deprecated compat:factory-refactor — use `connectingUserStoryHelper.connectingUserStoryCap(…)` */
export const connectingUserStoryCap = (flowCount: number): number => connectingUserStoryHelper.connectingUserStoryCap(flowCount)

/** @deprecated compat:factory-refactor — use `connectingUserStoryHelper.mergeConnectingUserStories(…)` */
export const mergeConnectingUserStories = (flow: WorkcardDraft[], connecting: ConnectingUserStoryDraft[]): MergedUserStoryDraft[] =>
  connectingUserStoryHelper.mergeConnectingUserStories(flow, connecting)
