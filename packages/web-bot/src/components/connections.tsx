import { useCallback, useMemo, useState, type FC } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import type { BotConnection } from '@owlmeans/bot'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '../@/components/ui/button.js'
import {
  Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle,
} from '../@/components/ui/card.js'
import { BOT_I18N } from '../consts.js'
import { botViewHelper } from '../helpers/view.js'
import { useBotConnections } from '../hooks/use-bot-connections.js'
import { useBotPlatforms } from '../hooks/use-bot-platforms.js'
import type { BotConnectionsPanelProps } from '../types.js'
import { cn } from '../utils.js'
import { ConnectionForm } from './connections/form.js'
import { ConnectionItem } from './connections/item.js'
import { BotErrorNote } from './shared/error-note.js'
import { ConfirmDialog } from './shared/confirm-dialog.js'

/**
 * Where the person who runs the bot CONNECTS it: every connection of the surface with its status,
 * the bot account it verified as, how it receives and what failed last — and adding, changing,
 * verifying, switching off and removing one.
 *
 * The platforms are the server's registered ones (`platform.list`); `platforms` limits what a NEW
 * connection may be made on (the product's platforms). Every connection made here is live; a mock one
 * exists only when created through the API (tests, the runtime smoke) and is shown with a badge.
 */
export const BotConnectionsPanel: FC<BotConnectionsPanelProps> = ({ surface, platforms, className }) => {
  const t = useI18nLib(BOT_I18N)
  const { items, loading, error, save, verify, remove } = useBotConnections(surface)
  const registered = useBotPlatforms(surface)
  const allowed = useMemo(() => botViewHelper.platformsOf(registered.items, platforms), [registered.items, platforms])
  const ids = useMemo(() => registered.items.map(descriptor => descriptor.platform), [registered.items])

  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<BotConnection | null>(null)
  const [removing, setRemoving] = useState<BotConnection | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState<Error | null>(null)

  const openForm = useCallback((connection: BotConnection | null) => {
    setEditing(connection)
    setFormKey(key => key + 1)
    setFormOpen(true)
  }, [])

  const toggle = useCallback(async (connection: BotConnection) => await save({
    id: connection.id, platform: connection.platform, label: connection.label, enabled: !connection.enabled,
  }), [save])

  const confirmRemove = useCallback(async () => {
    if (removing == null || removeBusy) return
    setRemoveBusy(true)
    setRemoveError(null)
    try {
      const outcome = await remove(removing.id)
      if (outcome.ok) {
        setRemoving(null)
      } else {
        setRemoveError(outcome.error ?? null)
      }
    } finally {
      setRemoveBusy(false)
    }
  }, [removing, removeBusy, remove])

  return <Card className={cn('w-full', className)} data-bot-connections>
    <CardHeader>
      <CardTitle>{t('connections.title')}</CardTitle>
      <CardDescription>{t('connections.description')}</CardDescription>
      <CardAction>
        <Button type="button" data-bot-action="add" onClick={() => openForm(null)}>
          <Plus aria-hidden />
          {t('connections.add')}
        </Button>
      </CardAction>
    </CardHeader>

    <CardContent className="flex flex-col gap-4">
      {error != null && <BotErrorNote error={error} variant="alert" platforms={ids} />}
      {registered.error != null && <BotErrorNote error={registered.error} variant="alert" platforms={ids} />}

      {loading && items.length === 0
        ? <div className="text-muted-foreground flex justify-center py-8" data-bot-loading>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
        : items.length === 0
          ? <p className="text-muted-foreground py-8 text-center text-sm" data-bot-empty>{t('connections.empty')}</p>
          : <ul className="divide-y rounded-xl border">
            {items.map(connection => <ConnectionItem
              key={connection.id}
              connection={connection}
              descriptor={registered.descriptorOf(connection.platform)}
              platforms={ids}
              onVerify={verify}
              onToggle={toggle}
              onEdit={openForm}
              onRemove={target => { setRemoveError(null); setRemoving(target) }}
            />)}
          </ul>}
    </CardContent>

    <ConnectionForm
      key={formKey}
      open={formOpen}
      editing={editing}
      platforms={allowed}
      descriptors={registered.items}
      onSave={save}
      onClose={() => setFormOpen(false)}
    />

    <ConfirmDialog
      open={removing != null}
      title={t('connections.remove-title')}
      description={t('connections.remove-description', { label: removing?.label ?? '' })}
      confirm={t('common.remove')}
      busy={removeBusy}
      error={removeError}
      onConfirm={() => { void confirmRemove() }}
      onCancel={() => setRemoving(null)}
    />
  </Card>
}
