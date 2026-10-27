import { useCallback, useEffect, useId, useMemo, useState, type FC, type FormEvent } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import {
  BOT_NAME_MAX, BOT_TEXT_MAX, BotChatKind, BotTransport, botRuleHelper, type BotConnection, type BotSimulateInput,
} from '@owlmeans/bot'
import { Loader2, Send } from 'lucide-react'
import { Button } from '../@/components/ui/button.js'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '../@/components/ui/card.js'
import { Input } from '../@/components/ui/input.js'
import { Label } from '../@/components/ui/label.js'
import { Textarea } from '../@/components/ui/textarea.js'
import {
  BOT_I18N, BOT_SIMULATOR_POLL_MS, BOT_SIMULATOR_SETTLE_MS, BOT_SIMULATOR_WAIT_MS,
} from '../consts.js'
import { useBotActivity } from '../hooks/use-bot-activity.js'
import { useBotConnections } from '../hooks/use-bot-connections.js'
import { useBotRules } from '../hooks/use-bot-rules.js'
import type { BotSimulatorProps } from '../types.js'
import { cn } from '../utils.js'
import { ActivityList } from './activity/list.js'
import { BotErrorNote } from './shared/error-note.js'
import { Segmented } from './shared/segmented.js'
import type { SimulatorState } from './simulator/types.js'

/**
 * Try the bot without a real chat: a message typed here goes to a MOCK connection through the
 * platform's own path (native payload, signature, normalization, inbox, handlers), and the activity
 * it caused is shown as it arrives. Before sending, the groups the text matches are named — by the
 * same matcher the bot uses.
 *
 * Renders nothing for a live connection, or one this surface does not have: a real platform cannot
 * be fed a message, and the server would refuse it (`BotTransportMismatch`).
 */
export const BotSimulator: FC<BotSimulatorProps> = ({ surface, connection, className }) => {
  const t = useI18nLib(BOT_I18N)
  const id = useId()
  const { items: connections, simulate } = useBotConnections(surface)
  const connectionId = typeof connection === 'string' ? connection : connection.id
  // The surface's own record wins over the one passed in: it is the one a change updates.
  const resolved: BotConnection | null = connections.find(entry => entry.id === connectionId)
    ?? (typeof connection === 'string' ? null : connection)
  const mock = resolved?.transport === BotTransport.Mock

  const { items: rules } = useBotRules(surface, { connection: connectionId })

  const [text, setText] = useState('')
  const [chatKind, setChatKind] = useState<BotChatKind>(BotChatKind.Group)
  const [chatTitle, setChatTitle] = useState('')
  const [senderName, setSenderName] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [update, setUpdate] = useState<string | null>(null)
  const [state, setState] = useState<SimulatorState>('idle')
  const [firstSeenAt, setFirstSeenAt] = useState<number | null>(null)

  const polling = state === 'waiting' || (state === 'reacted' && firstSeenAt != null)
  const activity = useBotActivity(surface, {
    connection: connectionId, limit: 50, refreshMs: mock && polling ? BOT_SIMULATOR_POLL_MS : 0,
  })
  const reactions = useMemo(
    () => update == null ? [] : activity.items.filter(entry => entry.update === update),
    [activity.items, update]
  )
  const ruleNames = useMemo(() => new Map(rules.map(rule => [rule.id, rule.name])), [rules])
  const matched = useMemo(
    () => text.trim() === '' ? [] : botRuleHelper.match(text, rules).map(match => match.rule.name),
    [text, rules]
  )

  // The first reaction ends the wait; the reading goes on a little longer for the ones that follow
  // it (a warning after a deletion), then stops.
  useEffect(() => {
    if (state === 'waiting' && reactions.length > 0) {
      setState('reacted')
      setFirstSeenAt(Date.now())
    }
  }, [state, reactions.length])

  useEffect(() => {
    if (state === 'waiting') {
      const timer = setTimeout(() => setState(current => current === 'waiting' ? 'silent' : current), BOT_SIMULATOR_WAIT_MS)

      return () => clearTimeout(timer)
    }
    if (state === 'reacted' && firstSeenAt != null) {
      const timer = setTimeout(() => setFirstSeenAt(null), BOT_SIMULATOR_SETTLE_MS)

      return () => clearTimeout(timer)
    }

    return undefined
  }, [state, firstSeenAt])

  const send = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    if (resolved == null || text.trim() === '' || sending) return
    const input: BotSimulateInput = {
      text,
      chat: { kind: chatKind, ...(chatTitle.trim() !== '' ? { title: chatTitle.trim() } : {}) },
      ...(senderName.trim() !== '' ? { sender: { name: senderName.trim() } } : {}),
    }
    setSending(true)
    setError(null)
    try {
      const outcome = await simulate(resolved.id, input)
      if (outcome.ok && outcome.value != null) {
        setUpdate(outcome.value.update)
        setFirstSeenAt(null)
        setState('waiting')
      } else {
        setError(outcome.error ?? null)
      }
    } finally {
      setSending(false)
    }
  }, [resolved, text, chatKind, chatTitle, senderName, sending, simulate])

  if (resolved == null || !mock) return null

  return <Card className={cn('w-full', className)} data-bot-simulator data-bot-connection={resolved.id}>
    <CardHeader>
      <CardTitle>{t('simulator.title')}</CardTitle>
      <CardDescription>{t('simulator.description', { label: resolved.label })}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <form className="flex flex-col gap-4" onSubmit={event => { void send(event) }} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-text`}>{t('simulator.text')}</Label>
          <Textarea
            id={`${id}-text`} data-bot-input="text" value={text} maxLength={BOT_TEXT_MAX} rows={3}
            placeholder={t('simulator.text-placeholder')} onChange={event => setText(event.target.value)}
          />
          {text.trim() !== '' && <p className="text-muted-foreground text-xs" data-bot-simulator-matches={matched.length}>
            {matched.length > 0 ? t('simulator.matches', { names: matched.join(', ') }) : t('simulator.no-match')}
          </p>}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-none font-medium">{t('simulator.chat')}</p>
            <Segmented
              name="chat-kind" label={t('simulator.chat')} value={chatKind} onChange={setChatKind}
              options={[
                { value: BotChatKind.Group, label: t('simulator.chat-group') },
                { value: BotChatKind.Private, label: t('simulator.chat-private') },
              ]}
            />
          </div>
          <div className="flex min-w-[10rem] flex-1 flex-col gap-2">
            <Label htmlFor={`${id}-chat`}>
              {t('simulator.chat-title')}
              <span className="text-muted-foreground font-normal">({t('common.optional')})</span>
            </Label>
            <Input
              id={`${id}-chat`} data-bot-input="chat" value={chatTitle} maxLength={BOT_NAME_MAX}
              onChange={event => setChatTitle(event.target.value)}
            />
          </div>
          <div className="flex min-w-[10rem] flex-1 flex-col gap-2">
            <Label htmlFor={`${id}-sender`}>
              {t('simulator.sender')}
              <span className="text-muted-foreground font-normal">({t('common.optional')})</span>
            </Label>
            <Input
              id={`${id}-sender`} data-bot-input="sender" value={senderName} maxLength={BOT_NAME_MAX}
              onChange={event => setSenderName(event.target.value)}
            />
          </div>
        </div>

        <BotErrorNote error={error} />

        <Button type="submit" className="w-fit" data-bot-action="simulate" disabled={text.trim() === '' || sending}>
          {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {t('simulator.send')}
        </Button>
      </form>

      {state !== 'idle' && <div className="flex flex-col gap-2" data-bot-simulator-state={state} aria-live="polite">
        {state === 'waiting' && <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('simulator.waiting')}
        </p>}
        {state === 'silent' && <p className="text-muted-foreground text-sm">{t('simulator.silent')}</p>}
        {state === 'reacted' && <p className="text-sm font-medium">{t('simulator.reacted')}</p>}
        {reactions.length > 0 && <ActivityList items={reactions} rules={ruleNames} />}
      </div>}
    </CardContent>
  </Card>
}
