import type { BotActivity } from '@owlmeans/bot'

export interface ActivityListProps {
  items: BotActivity[]
  /** Rule id → its name, so a row says which group it followed. */
  rules: Map<string, string>
  /** Connection id → its label; a row names its connection only when this is given. */
  connections?: Map<string, string>
}
