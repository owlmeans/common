import type { FC } from 'react'
import { Bot } from 'lucide-react'
import { cn } from '../../utils.js'
import { PLATFORM_ICONS } from './consts.local.js'
import type { PlatformIconProps } from './types.js'

export const PlatformIcon: FC<PlatformIconProps> = ({ platform, className }) => {
  const Icon = PLATFORM_ICONS[platform] ?? Bot

  return <Icon aria-hidden data-bot-platform-icon={platform} className={cn('size-4 shrink-0', className)} />
}
