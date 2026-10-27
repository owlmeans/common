import { BotConnectionStatus } from '@owlmeans/bot'

/**
 * Only a connected bot gets the filled pill; a failure is the one alarming colour, and the two
 * states nothing is happening in are quiet — the application's tokens decide what those look like.
 */
export const STATUS_VARIANT: Record<BotConnectionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  [BotConnectionStatus.Connected]: 'default',
  [BotConnectionStatus.Pending]: 'secondary',
  [BotConnectionStatus.Failed]: 'destructive',
  [BotConnectionStatus.Disabled]: 'outline',
}
