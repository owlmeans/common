import type { BotPlatform } from '@owlmeans/bot'

export interface BotErrorNoteProps {
  error: Error | string | null | undefined
  /** `alert`: a bordered banner for a failed read; `inline`: one line under the control that failed. */
  variant?: 'alert' | 'inline'
  className?: string
}

export interface CopyButtonProps {
  value: string
  /** What is copied, for the button's accessible name. */
  label: string
  /** Stable hook for tests: `data-bot-copy="<what>"`. */
  what: string
}

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirm: string
  busy?: boolean
  error?: Error | null
  onConfirm: () => void
  onCancel: () => void
}

export interface PlatformIconProps {
  platform: BotPlatform
  className?: string
}
