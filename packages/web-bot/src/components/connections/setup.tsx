import type { FC } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { BotTransport } from '@owlmeans/bot'
import { ExternalLink } from 'lucide-react'
import { BOT_I18N } from '../../consts.js'
import { botViewHelper } from '../../helpers/view.js'
import { CopyButton } from '../shared/copy-button.js'
import type { ConnectionSetupProps, PlatformHintProps } from './types.js'

/**
 * What a person does in the platform itself so the bot can act — the descriptor's own hint in the
 * reader's language, and its link (an invite) once its values are known.
 */
export const PlatformHint: FC<PlatformHintProps> = ({ descriptor, values = {}, identity, beforeSave }) => {
  const t = useI18nLib(BOT_I18N, 'connections.hint')
  const [lng] = useLanguage()
  const manual = descriptor.setup === 'manual'
  const link = descriptor.link
  const href = botViewHelper.linkOf(descriptor, values, identity)

  return <div className="text-muted-foreground flex flex-col gap-2 text-sm" data-bot-hint={descriptor.platform}>
    <p>{beforeSave === true && manual
      ? t('after-save', { platform: descriptor.title })
      : botViewHelper.textOf(descriptor.hint, lng)}</p>
    {link != null && (href != null
      ? <a
        href={href} target="_blank" rel="noopener noreferrer" data-bot-link={link.kind}
        {...(link.kind === 'invite' ? { 'data-bot-invite': '' } : {})}
        className="text-foreground inline-flex w-fit items-center gap-1 font-medium underline underline-offset-4"
      >
        {botViewHelper.textOf(link.label, lng, link.kind)}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
      : botViewHelper.textOf(link.pending, lng) !== '' && <p data-bot-link-pending={link.kind}>
        {botViewHelper.textOf(link.pending, lng)}
      </p>)}
  </div>
}

/**
 * A live connection's setup: the platform hint, and for a platform set up by hand the address and
 * values to paste, each with its own copy button. A mock connection (made through the API for tests)
 * reaches no platform, and a platform the server has no plugin for has no hint: nothing is drawn.
 */
export const ConnectionSetup: FC<ConnectionSetupProps> = ({ connection, descriptor }) => {
  const t = useI18nLib(BOT_I18N, 'connections')

  if (connection.transport === BotTransport.Mock || descriptor == null) {
    return null
  }

  const manual = descriptor.setup === 'manual'
  const steps = (connection.setup ?? []).map(step => botViewHelper.setupLineOf(step))
    // The hook URL is drawn on its own row; a step that only repeats it is not drawn twice.
    .filter(line => connection.hookUrl == null || line.value !== connection.hookUrl)

  return <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-3" data-bot-setup={connection.platform}>
    <PlatformHint descriptor={descriptor} identity={connection.identity?.id} />
    {manual && (connection.hookUrl != null || steps.length > 0) && <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t('setup-title', { platform: descriptor.title })}</p>
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
