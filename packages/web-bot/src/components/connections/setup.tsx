import type { FC } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import { BOT_PLATFORMS, BotPlatform, BotTransport } from '@owlmeans/bot'
import { ExternalLink } from 'lucide-react'
import { BOT_I18N } from '../../consts.js'
import { botViewHelper } from '../../helpers/view.js'
import { CopyButton } from '../shared/copy-button.js'
import type { ConnectionSetupProps, PlatformHintProps } from './types.js'

/**
 * What a person does in the platform itself so the bot can act: the Telegram admin right, the
 * Discord invite (once the application id is known), the WhatsApp and Slack console steps.
 */
export const PlatformHint: FC<PlatformHintProps> = ({ platform, applicationId, beforeSave }) => {
  const t = useI18nLib(BOT_I18N, 'connections.hint')
  const invite = platform === BotPlatform.Discord ? botViewHelper.discordInviteUrl(applicationId) : null
  const manual = BOT_PLATFORMS[platform]?.setup === 'manual'

  return <div className="text-muted-foreground flex flex-col gap-2 text-sm" data-bot-hint={platform}>
    <p>{beforeSave === true && manual
      ? t('after-save', { platform: BOT_PLATFORMS[platform]?.title ?? platform })
      : t(platform)}</p>
    {platform === BotPlatform.Discord && (invite != null
      ? <a
        href={invite} target="_blank" rel="noopener noreferrer" data-bot-invite
        className="text-foreground inline-flex w-fit items-center gap-1 font-medium underline underline-offset-4"
      >
        {t('discord-invite')}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
      : <p>{t('discord-pending')}</p>)}
  </div>
}

/**
 * A live connection's setup: the platform hint, and for a platform set up by hand (WhatsApp, Slack)
 * the address and values to paste, each with its own copy button. A mock connection needs none of
 * it — nothing reaches the platform.
 */
export const ConnectionSetup: FC<ConnectionSetupProps> = ({ connection }) => {
  const t = useI18nLib(BOT_I18N, 'connections')
  const descriptor = BOT_PLATFORMS[connection.platform]

  if (connection.transport === BotTransport.Mock) {
    return <p className="text-muted-foreground text-sm" data-bot-hint="mock">
      {t('mock-note', { platform: descriptor?.title ?? connection.platform })}
    </p>
  }

  const manual = descriptor?.setup === 'manual'
  const steps = (connection.setup ?? []).map(step => botViewHelper.setupLineOf(step))
    // The hook URL is drawn on its own row; a step that only repeats it is not drawn twice.
    .filter(line => connection.hookUrl == null || line.value !== connection.hookUrl)

  return <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3" data-bot-setup={connection.platform}>
    <PlatformHint platform={connection.platform} applicationId={connection.identity?.id} />
    {manual && (connection.hookUrl != null || steps.length > 0) && <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t('setup-title', { platform: descriptor?.title ?? connection.platform })}</p>
      <ol className="flex flex-col gap-2 text-sm">
        {connection.hookUrl != null && <li className="flex flex-wrap items-center gap-2" data-bot-setup-step="hook">
          <span className="text-muted-foreground">{t('hook-url')}</span>
          <code className="bg-background min-w-0 rounded border px-1.5 py-0.5 font-mono text-xs break-all">
            {connection.hookUrl}
          </code>
          <CopyButton value={connection.hookUrl} label={t('hook-url')} what="hook" />
        </li>}
        {steps.map((line, index) => <li key={index} className="flex flex-wrap items-center gap-2" data-bot-setup-step={index}>
          {line.label == null
            ? <span>{line.value}</span>
            : <>
              <span className="text-muted-foreground">{line.label}</span>
              <code className="bg-background min-w-0 rounded border px-1.5 py-0.5 font-mono text-xs break-all">{line.value}</code>
              <CopyButton value={line.value} label={line.label} what={`step-${index}`} />
            </>}
        </li>)}
      </ol>
    </div>}
  </div>
}
