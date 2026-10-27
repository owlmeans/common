import { useMemo, useState, type FC } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '../@/components/ui/button.js'
import {
  Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle,
} from '../@/components/ui/card.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../@/components/ui/select.js'
import { BOT_ACTIVITY_LIMITS, BOT_ACTIVITY_REFRESH_MS, BOT_I18N } from '../consts.js'
import { useBotActivity } from '../hooks/use-bot-activity.js'
import { useBotConnections } from '../hooks/use-bot-connections.js'
import { useBotRules } from '../hooks/use-bot-rules.js'
import type { BotActivityPanelProps } from '../types.js'
import { cn } from '../utils.js'
import { ActivityList } from './activity/list.js'
import { BotErrorNote } from './shared/error-note.js'

/**
 * What the bot DID, newest first — read again every few seconds while the page is visible. With
 * `connection`, that connection's activity only; without it, every connection's, each row naming
 * its own.
 */
export const BotActivityPanel: FC<BotActivityPanelProps> = ({ surface, connection, className }) => {
  const t = useI18nLib(BOT_I18N)
  const [limit, setLimit] = useState<number>(BOT_ACTIVITY_LIMITS[0])
  const { items, loading, error, reload } = useBotActivity(surface, {
    connection, limit, refreshMs: BOT_ACTIVITY_REFRESH_MS,
  })
  const { items: rules } = useBotRules(surface, { connection })
  const { items: connections } = useBotConnections(surface)

  const ruleNames = useMemo(() => new Map(rules.map(rule => [rule.id, rule.name])), [rules])
  const labels = useMemo(() => connection == null || connection === ''
    ? new Map(connections.map(entry => [entry.id, entry.label]))
    : undefined, [connection, connections])

  return <Card className={cn('w-full', className)} data-bot-activity>
    <CardHeader>
      <CardTitle>{t('activity.title')}</CardTitle>
      <CardDescription>{t('activity.description')}</CardDescription>
      <CardAction className="flex flex-wrap items-center justify-end gap-2">
        <Select value={String(limit)} onValueChange={next => setLimit(Number(next))}>
          <SelectTrigger size="sm" aria-label={t('activity.limit')} data-bot-input="limit" data-bot-value={limit}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOT_ACTIVITY_LIMITS.map(option => <SelectItem key={option} value={String(option)} data-bot-option={option}>
              {t('activity.limit-option', { count: option })}
            </SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          type="button" variant="outline" size="icon" data-bot-action="refresh"
          aria-label={t('common.refresh')} title={t('common.refresh')} onClick={() => { void reload() }}
        >
          <RefreshCw aria-hidden className={cn(loading && 'animate-spin')} />
        </Button>
      </CardAction>
    </CardHeader>

    <CardContent className="flex flex-col gap-4">
      {error != null && <BotErrorNote error={error} variant="alert" />}
      {loading && items.length === 0
        ? <div className="text-muted-foreground flex justify-center py-8" data-bot-loading>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
        : items.length === 0
          ? <p className="text-muted-foreground py-8 text-center text-sm" data-bot-empty>{t('activity.empty')}</p>
          : <ActivityList items={items} rules={ruleNames} connections={labels} />}
    </CardContent>
  </Card>
}
