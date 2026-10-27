import { DISCORD_INVITE_BASE, DISCORD_INVITE_PERMISSIONS } from './consts.js'
import type { DiscordSetupHelper } from './types.js'

/**
 * The invite link and the steps of a Discord connection. The bot joins a server through the OAuth2
 * bot flow (`scope=bot` + the permission bit set) and reads messages only with the privileged
 * MESSAGE CONTENT intent switched on in the Developer Portal.
 */
export const createDiscordSetupHelper = (): DiscordSetupHelper => {
  const permissions = (): string => DISCORD_INVITE_PERMISSIONS

  const inviteUrl = (applicationId: string): string => {
    const query = new URLSearchParams({ client_id: applicationId.trim(), scope: 'bot', permissions: permissions() })

    return `${DISCORD_INVITE_BASE}?${query.toString()}`
  }

  const steps: DiscordSetupHelper['steps'] = connection => {
    const applicationId = connection.credentials.applicationId?.trim() ?? ''

    return [
      applicationId !== ''
        ? `Add the bot to your server with this invite link: ${inviteUrl(applicationId)}`
        : 'Save the application id (Discord Developer Portal → your application → General Information) to get the invite link.',
      'In the Discord Developer Portal, open your application → Bot → Privileged Gateway Intents and turn on MESSAGE CONTENT INTENT — without it Discord refuses the bot\'s connection (gateway close code 4014).',
      'The invite asks for View Channels, Send Messages, Send Messages in Threads, Read Message History, Manage Messages (delete), Add Reactions, Timeout Members (mute) and Ban Members; keep the bot\'s role above the roles of the members it moderates.',
      'Messages reach the bot over its gateway connection — no webhook address is needed.',
    ]
  }

  return { permissions, inviteUrl, steps }
}

export const discordSetupHelper = createDiscordSetupHelper()
