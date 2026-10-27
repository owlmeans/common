import type { FC } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '../../@/components/ui/alert.js'
import { BOT_I18N } from '../../consts.js'
import { botErrorHelper } from '../../helpers/error.js'
import { cn } from '../../utils.js'
import type { BotErrorNoteProps } from './types.js'

/**
 * A failure in the person's language: the sentence for its `BotError` class (or marker), then what
 * the server added — or, for a platform's refusal, one sentence with the platform's words in it. A
 * connection's `lastError` that carries no marker is the platform's own words and is shown as they are.
 */
export const BotErrorNote: FC<BotErrorNoteProps> = ({ error, variant = 'inline', className }) => {
  const t = useI18nLib(BOT_I18N, 'errors')
  if (error == null || error === '') return null

  const found = botErrorHelper.keyOf(error)
  const detail = botErrorHelper.detailOf(error)
  // A sentence that carries the detail ("The platform refused: …") needs one; without it the family's own stands.
  const inline = botErrorHelper.inlinesDetail(found) && detail != null
  const key = botErrorHelper.inlinesDetail(found) && detail == null ? 'bot' : found
  // React escapes what it renders: i18next's own escaping would show a platform's `'` or `/` as entities.
  const sentence = key === 'generic' && typeof error === 'string' ? null
    : inline ? t(key, { detail, interpolation: { escapeValue: false } }) : t(key)
  const below = inline ? null : detail

  if (variant === 'alert') {
    return <Alert variant="destructive" data-bot-error={key} className={className}>
      <CircleAlert aria-hidden />
      <AlertTitle className={cn(inline && 'break-all')}>{sentence ?? t('title')}</AlertTitle>
      {below != null && <AlertDescription className="break-all">{below}</AlertDescription>}
    </Alert>
  }

  return <p role="alert" data-bot-error={key} className={cn('text-destructive text-sm', inline && 'break-all', className)}>
    {sentence}
    {below != null && <span className={cn('break-all', sentence != null && 'block text-xs opacity-80')}>{below}</span>}
  </p>
}
