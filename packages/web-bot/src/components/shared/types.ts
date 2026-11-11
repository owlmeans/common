import type { BotPlatformGlyph, BotPlatformId } from '@owlmeans/bot'

export interface BotErrorNoteProps {
  error: Error | string | null | undefined
  /** `alert`: a bordered banner for a failed read; `inline`: one line under the control that failed. */
  variant?: 'alert' | 'inline'
  /** The server's registered platform ids — a stored legacy `bot:<id>:…` refusal reads as the platform's. */
  platforms?: readonly BotPlatformId[]
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
  platform: BotPlatformId
  /** The descriptor's glyph; absent (an unregistered platform): a generic bot. */
  glyph?: BotPlatformGlyph
  className?: string
}
