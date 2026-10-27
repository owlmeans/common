import type { BotConnection, BotRule, BotRuleAction, BotRuleInput } from '@owlmeans/bot'
import type { BotOutcome } from '../../types.js'

export interface KeywordInputProps {
  id?: string
  value: string[]
  onChange: (keywords: string[]) => void
  /** What is typed but not yet a chip — kept by the form, so saving picks it up. */
  pending: string
  onPendingChange: (text: string) => void
  placeholder?: string
}

export interface RuleFormProps {
  open: boolean
  /** The group being changed; a new one when null. */
  editing: BotRule | null
  actions: BotRuleAction[]
  connections: BotConnection[]
  /** The connection a new group is made for; every connection when absent. */
  connection?: string
  nextOrder: number
  onSave: (input: BotRuleInput) => Promise<BotOutcome<BotRule>>
  onClose: () => void
}
