import type { FC } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { BotTransport } from '@owlmeans/bot'
import { Badge } from '../../@/components/ui/badge.js'
import { BOT_I18N } from '../../consts.js'
import { botViewHelper } from '../../helpers/view.js'
import { BotErrorNote } from '../shared/error-note.js'
import { PlatformIcon } from '../shared/platform-icon.js'
import type { ActivityListProps } from './types.js'

/** What the bot did, one row per action: when, what, to whom, about which message, and whether it worked. */
export const ActivityList: FC<ActivityListProps> = ({ items, refLabel, connections }) => {
  const t = useI18nLib(BOT_I18N)
  const [lng] = useLanguage()

  return <ul className="divide-y rounded-xl border">
    {items.map(activity => {
      const ref = activity.ref != null && activity.ref !== '' && refLabel != null ? refLabel(activity.ref) : undefined
      const target = activity.target == null ? [] : [
        activity.target.chat !== '' ? `${t('activity.chat')} ${activity.target.chat}` : null,
        activity.target.message != null ? `${t('activity.message')} ${activity.target.message}` : null,
        activity.target.user != null ? `${t('activity.user')} ${activity.target.user}` : null,
      ].filter(part => part != null)

      return <li
        key={activity.id}
        className="flex flex-col gap-1.5 px-4 py-3"
        data-bot-activity-item={activity.id}
        data-bot-kind={activity.action}
        data-bot-ok={activity.ok ? 'true' : 'false'}
        data-bot-transport={activity.transport}
        data-bot-update={activity.update}
      >
        <div className="flex flex-wrap items-center gap-2">
          <time dateTime={activity.at} className="text-muted-foreground text-xs tabular-nums">
            {botViewHelper.formatMoment(activity.at, lng) ?? activity.at}
          </time>
          <Badge variant="outline" className="rounded-full">
            <PlatformIcon platform={activity.platform} />
            {t(`action.${activity.action}`)}
          </Badge>
          <Badge variant={activity.ok ? 'secondary' : 'destructive'} className="rounded-full" data-bot-result>
            {t(activity.ok ? 'activity.ok' : 'activity.failed')}
          </Badge>
          {activity.transport === BotTransport.Mock && <Badge variant="outline" className="rounded-full" data-bot-mock>
            {t('transport.mock')}
          </Badge>}
          {ref != null && ref !== '' && <span className="text-muted-foreground text-xs" data-bot-activity-ref={activity.ref}>
            {ref}
          </span>}
          {connections != null && <span className="text-muted-foreground text-xs">
            {connections.get(activity.connection) ?? activity.connection}
          </span>}
        </div>
        {activity.text != null && activity.text !== '' && <p className="text-sm break-words" data-bot-activity-text>
          {botViewHelper.excerpt(activity.text)}
        </p>}
        {target.length > 0 && <p className="text-muted-foreground font-mono text-xs break-all">{target.join(' · ')}</p>}
        {/* Translated from the machine `code`; a row recorded before it carried one has the marker in `error`. */}
        {!activity.ok && <BotErrorNote error={activity.code ?? activity.error ?? ''} />}
      </li>
    })}
  </ul>
}
