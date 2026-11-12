import {
  BOT_TEXT_FALLBACK_LANGUAGE, type BotCredentialField, type BotPlatformDescriptor, type BotPlatformId, type BotTexts,
} from '@owlmeans/bot'
import { BOT_EXCERPT_MAX } from '../consts.js'
import type { BotSetupLine, BotViewHelper } from './view/types.js'

export const createBotViewHelper = (): BotViewHelper => {
  const platformsOf = (
    descriptors: readonly BotPlatformDescriptor[], platforms?: readonly BotPlatformId[]
  ): BotPlatformDescriptor[] => {
    const allowed = descriptors.filter(descriptor => platforms?.includes(descriptor.platform) ?? true)

    return allowed.length > 0 ? allowed : [...descriptors]
  }

  const typedCredentialsOf = (descriptor: BotPlatformDescriptor | null | undefined): BotCredentialField[] =>
    (descriptor?.credentials ?? []).filter(field => field.generated !== true)

  const textOf = (texts: BotTexts | null | undefined, lng?: string, fallback: string = ''): string => {
    if (texts == null) return fallback
    const base = lng?.split(/[-_]/)[0]
    for (const language of [lng, base, BOT_TEXT_FALLBACK_LANGUAGE]) {
      const text = language != null && language !== '' ? texts[language] : undefined
      if (typeof text === 'string' && text.trim() !== '') return text
    }

    return fallback
  }

  const linkOf = (
    descriptor: BotPlatformDescriptor | null | undefined, values: Readonly<Record<string, string | undefined>>,
    identity?: string | null
  ): string | null => {
    const link = descriptor?.link
    if (link == null) return null
    let url = link.template
    for (const param of link.params) {
      const typed = (values[param.key] ?? '').trim()
      const value = typed !== '' ? typed : param.identity === true ? (identity ?? '').trim() : ''
      try {
        if (value === '' || !new RegExp(param.pattern).test(value)) return null
      } catch {
        // A pattern that does not compile proves nothing: no link rather than a wrong one.
        return null
      }
      url = url.split(`{${param.key}}`).join(encodeURIComponent(value))
    }

    return url
  }

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

  return { platformsOf, typedCredentialsOf, textOf, linkOf, formatMoment, excerpt, setupLineOf }
}

export const botViewHelper = createBotViewHelper()
