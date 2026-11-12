import type { BotActivity, BotPlatformDescriptor } from '@owlmeans/bot'
import type { BotRefLabel } from '../../types.js'

export interface ActivityListProps {
  items: BotActivity[]
  /** Names a row's `ref` (the application's own record it followed); absent or `undefined`: nothing drawn. */
  refLabel?: BotRefLabel
  /** Connection id → its label; a row names its connection only when this is given. */
  connections?: Map<string, string>
  /** The server's registered descriptors — a row's glyph, and how a stored refusal is read. */
  descriptors: readonly BotPlatformDescriptor[]
}
