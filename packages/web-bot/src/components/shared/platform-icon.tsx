import type { FC } from 'react'
import { Bot } from 'lucide-react'
import { cn } from '../../utils.js'
import { GLYPH_ICONS } from './consts.local.js'
import type { PlatformIconProps } from './types.js'

/** The platform's neutral glyph from its descriptor — a generic bot when the platform has none (or no plugin). */
export const PlatformIcon: FC<PlatformIconProps> = ({ platform, glyph, className }) => {
  const Icon = (glyph != null ? GLYPH_ICONS[glyph] : undefined) ?? Bot

  return <Icon aria-hidden data-bot-platform-icon={platform} className={cn('size-4 shrink-0', className)} />
}
