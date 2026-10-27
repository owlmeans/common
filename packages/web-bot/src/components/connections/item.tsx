import { useCallback, useState, type FC } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { BOT_PLATFORMS, BotConnectionStatus, BotTransport, type BotConnection } from '@owlmeans/bot'
import { Loader2, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { Badge } from '../../@/components/ui/badge.js'
import { Button } from '../../@/components/ui/button.js'
import { Switch } from '../../@/components/ui/switch.js'
import { BOT_I18N } from '../../consts.js'
import { botViewHelper } from '../../helpers/view.js'
import type { BotOutcome } from '../../types.js'
import { BotErrorNote } from '../shared/error-note.js'
import { PlatformIcon } from '../shared/platform-icon.js'
import { STATUS_VARIANT } from './consts.local.js'
import { ConnectionSetup } from './setup.js'
import type { ConnectionItemProps } from './types.js'

/** One connection: who the bot is, how it receives, what went wrong last, and what can be done. */
export const ConnectionItem: FC<ConnectionItemProps> = ({ connection, onVerify, onToggle, onEdit, onRemove }) => {
  const t = useI18nLib(BOT_I18N)
  const [lng] = useLanguage()
  const [verifying, setVerifying] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [outcome, setOutcome] = useState<BotOutcome<BotConnection> | null>(null)
  const [toggleError, setToggleError] = useState<Error | null>(null)

  const descriptor = BOT_PLATFORMS[connection.platform]
  const mock = connection.transport === BotTransport.Mock
  const identity = connection.identity?.username != null && connection.identity.username !== ''
    ? `@${connection.identity.username}`
    : connection.identity?.name ?? connection.identity?.id ?? null
  const lastEvent = botViewHelper.formatMoment(connection.lastEventAt, lng)

  const verify = useCallback(async () => {
    setVerifying(true)
    setOutcome(null)
    try {
      setOutcome(await onVerify(connection.id))
    } finally {
      setVerifying(false)
    }
  }, [connection.id, onVerify])

  const toggle = useCallback(async () => {
    setToggling(true)
    setToggleError(null)
    try {
      const result = await onToggle(connection)
      if (!result.ok) setToggleError(result.error ?? null)
    } finally {
      setToggling(false)
    }
  }, [connection, onToggle])

  // A verification that came back is shown as what it found: the bot's name, or why it failed. The
  // failure of the CALL is the outcome's error; a call that went through may still report a
  // connection that failed, whose reason is its `lastError` (drawn below with the rest).
  const verified = outcome?.ok === true && outcome.value?.status === BotConnectionStatus.Connected

  return <li
    className="flex flex-col gap-3 p-4"
    data-bot-connection={connection.id}
    data-bot-platform={connection.platform}
    data-bot-status={connection.status}
    data-bot-transport={connection.transport}
    data-bot-enabled={connection.enabled ? 'true' : 'false'}
  >
    <div className="flex flex-wrap items-center gap-2">
      <PlatformIcon platform={connection.platform} className="text-muted-foreground" />
      <span className="font-medium break-all" data-bot-label>{connection.label}</span>
      <span className="text-muted-foreground text-sm">{descriptor?.title ?? connection.platform}</span>
      {mock && <Badge variant="outline" className="rounded-full" data-bot-mock>{t('transport.mock')}</Badge>}
      <Badge variant={STATUS_VARIANT[connection.status] ?? 'secondary'} className="rounded-full" data-bot-status-pill>
        {t(`status.${connection.status}`)}
      </Badge>
    </div>

    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{t('connections.identity')}</dt>
      <dd className="min-w-0 break-all" data-bot-identity>{identity ?? t('connections.no-identity')}</dd>
      <dt className="text-muted-foreground">{t('connections.receive')}</dt>
      <dd data-bot-receive={connection.receive}>{t(`receive.${connection.receive}`)}</dd>
      {lastEvent != null && <>
        <dt className="text-muted-foreground">{t('connections.last-event')}</dt>
        <dd>{lastEvent}</dd>
      </>}
    </dl>

    {connection.lastError != null && connection.lastError !== '' && <div data-bot-last-error>
      <p className="text-muted-foreground text-xs">{t('connections.last-error')}</p>
      <BotErrorNote error={connection.lastError} />
    </div>}

    {verified && <p role="status" className="text-sm" data-bot-verified>
      {t('connections.verified', { name: identity ?? '' })}
    </p>}
    {outcome?.ok === false && <div data-bot-verify-error><BotErrorNote error={outcome.error} /></div>}
    {toggleError != null && <BotErrorNote error={toggleError} />}

    <ConnectionSetup connection={connection} />

    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button" variant="outline" size="sm" data-bot-action="verify" disabled={verifying}
        onClick={() => { void verify() }}
      >
        {verifying ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}
        {t(verifying ? 'connections.verifying' : 'connections.verify')}
      </Button>
      <Button type="button" variant="ghost" size="sm" data-bot-action="edit" onClick={() => onEdit(connection)}>
        <Pencil aria-hidden />
        {t('common.edit')}
      </Button>
      <label className="flex items-center gap-2 px-2 text-sm">
        <Switch
          checked={connection.enabled} disabled={toggling} data-bot-action="toggle"
          aria-label={t('common.enabled')} onCheckedChange={() => { void toggle() }}
        />
        {t('common.enabled')}
      </label>
      <Button
        type="button" variant="ghost" size="sm" data-bot-action="remove" className="text-destructive ml-auto"
        onClick={() => onRemove(connection)}
      >
        <Trash2 aria-hidden />
        {t('common.remove')}
      </Button>
    </div>
  </li>
}
