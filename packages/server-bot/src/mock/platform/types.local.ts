import type { BotMockCall } from '../../platforms/types.js'
import type { BotTestPayload } from './types.js'

/** One connection's fake platform: its queued updates, the receivers waiting for one and its call log. */
export interface BotTestFakeState {
  calls: BotMockCall[]
  queue: BotTestPayload[]
  waiters: Set<() => void>
}
