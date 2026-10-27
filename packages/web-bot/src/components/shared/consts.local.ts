import { BotPlatform } from '@owlmeans/bot'
import { Hash, MessagesSquare, Phone, Send, type LucideIcon } from 'lucide-react'

/**
 * A neutral glyph per platform — no brand marks and no brand colours: the panels inherit the
 * application's look, and the platform's NAME is always written beside the glyph.
 */
export const PLATFORM_ICONS: Record<BotPlatform, LucideIcon> = {
  [BotPlatform.Telegram]: Send,
  [BotPlatform.WhatsApp]: Phone,
  [BotPlatform.Discord]: MessagesSquare,
  [BotPlatform.Slack]: Hash,
}
