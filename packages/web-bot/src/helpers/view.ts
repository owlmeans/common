import { BOT_PLATFORMS, type BotCredentialField, type BotPlatform, type BotRule, type BotRuleInput } from '@owlmeans/bot'
import { BOT_DISCORD_INVITE_URL, BOT_DISCORD_PERMISSIONS, BOT_EXCERPT_MAX } from '../consts.js'
import type { BotSetupLine, BotViewHelper } from './view/types.js'

export const createBotViewHelper = (): BotViewHelper => {
  const all = Object.keys(BOT_PLATFORMS) as BotPlatform[]

  const platformsOf = (platforms?: readonly BotPlatform[]): BotPlatform[] => {
    const allowed = all.filter(platform => platforms?.includes(platform) ?? true)

    return allowed.length > 0 ? allowed : [...all]
  }

  const typedCredentialsOf = (platform: BotPlatform): BotCredentialField[] =>
    (BOT_PLATFORMS[platform]?.credentials ?? []).filter(field => field.generated !== true)

  const orderRules = (rules: readonly BotRule[]): BotRule[] => [...rules].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name)
  )

  const ruleInputOf = (rule: BotRule): BotRuleInput => ({
    id: rule.id,
    connection: rule.connection ?? null,
    name: rule.name,
    keywords: [...rule.keywords],
    mode: rule.mode,
    action: rule.action,
    ...(rule.reply != null ? { reply: rule.reply } : {}),
    ...(rule.instruction != null ? { instruction: rule.instruction } : {}),
    enabled: rule.enabled,
    order: rule.order,
  })

  const nextOrder = (rules: readonly BotRule[]): number =>
    rules.reduce((max, rule) => Math.max(max, rule.order), 0) + 1

  const formatMoment = (value: string | null | undefined, lng?: string): string | null => {
    if (value == null || value === '') return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    try {
      return new Intl.DateTimeFormat(lng, { dateStyle: 'medium', timeStyle: 'medium' }).format(date)
    } catch {
      // An unknown language tag throws instead of falling back; a moment is not worth a blank row.
      return date.toISOString()
    }
  }

  const excerpt = (text: string | null | undefined, max: number = BOT_EXCERPT_MAX): string => {
    const line = (text ?? '').replace(/\s+/gu, ' ').trim()
    const chars = Array.from(line)

    return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : line
  }

  const setupLineOf = (step: string): BotSetupLine => {
    const split = /^([^:]{1,80}):\s+(\S+)\s*$/u.exec(step.trim())

    return split != null ? { label: split[1].trim(), value: split[2] } : { label: null, value: step.trim() }
  }

  const discordInviteUrl = (applicationId: string | null | undefined): string | null => {
    const id = (applicationId ?? '').trim()
    if (!/^\d{5,32}$/.test(id)) return null
    const query = new URLSearchParams({ client_id: id, scope: 'bot', permissions: BOT_DISCORD_PERMISSIONS })

    return `${BOT_DISCORD_INVITE_URL}?${query.toString()}`
  }

  const splitKeywords = (text: string): string[] =>
    text.split(/[,;\n]/u).map(keyword => keyword.trim()).filter(keyword => keyword !== '')

  return {
    platformsOf, typedCredentialsOf, orderRules, ruleInputOf, nextOrder, formatMoment, excerpt, setupLineOf, discordInviteUrl,
    splitKeywords,
  }
}

export const botViewHelper = createBotViewHelper()
