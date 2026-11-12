import type { BotPlatformGlyph } from '@owlmeans/bot'
import { Hash, MessageCircle, MessagesSquare, Phone, Send, type LucideIcon } from 'lucide-react'

/**
 * The icon of each neutral glyph a platform descriptor names — no brand marks and no brand colours:
 * the panels inherit the application's look, and the platform's NAME is always written beside it.
 */
export const GLYPH_ICONS: Readonly<Record<BotPlatformGlyph, LucideIcon>> = Object.freeze({
  send: Send,
  phone: Phone,
  messages: MessagesSquare,
  hash: Hash,
  chat: MessageCircle,
})
