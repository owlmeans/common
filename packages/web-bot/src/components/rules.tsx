import { useCallback, useMemo, useState, type FC } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import type { BotRule } from '@owlmeans/bot'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '../@/components/ui/badge.js'
import { Button } from '../@/components/ui/button.js'
import {
  Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle,
} from '../@/components/ui/card.js'
import { Switch } from '../@/components/ui/switch.js'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../@/components/ui/table.js'
import { BOT_I18N } from '../consts.js'
import { botViewHelper } from '../helpers/view.js'
import { useBotConnections } from '../hooks/use-bot-connections.js'
import { useBotRules } from '../hooks/use-bot-rules.js'
import type { BotRulesPanelProps } from '../types.js'
import { cn } from '../utils.js'
import { COLUMNS, ROW_KEYWORDS } from './rules/consts.local.js'
import { RuleForm } from './rules/form.js'
import { BotErrorNote } from './shared/error-note.js'
import { ConfirmDialog } from './shared/confirm-dialog.js'

/**
 * The bot's KEYWORD GROUPS — its own records, each with its keywords, its match mode, the kit action
 * it takes and the instruction that goes with it — in the order the bot applies them, with the
 * editor to add and change one.
 *
 * `actions` is the product kit's: the editor never offers another. With `connection`, the panel
 * shows that connection's groups and the scope-wide ones, and a new group is made for it.
 */
export const BotRulesPanel: FC<BotRulesPanelProps> = ({ surface, actions, connection, className }) => {
  const t = useI18nLib(BOT_I18N)
  const { items, loading, error, save, remove } = useBotRules(surface, { connection })
  const { items: connections } = useBotConnections(surface)
  const labels = useMemo(() => new Map(connections.map(entry => [entry.id, entry.label])), [connections])

  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editing, setEditing] = useState<BotRule | null>(null)
  const [removing, setRemoving] = useState<BotRule | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [removeError, setRemoveError] = useState<Error | null>(null)
  const [rowError, setRowError] = useState<{ id: string, error: Error } | null>(null)

  const openForm = useCallback((rule: BotRule | null) => {
    setEditing(rule)
    setFormKey(key => key + 1)
    setFormOpen(true)
  }, [])

  const toggle = useCallback(async (rule: BotRule) => {
    setRowError(null)
    const outcome = await save({ ...botViewHelper.ruleInputOf(rule), enabled: !rule.enabled })
    if (!outcome.ok && outcome.error != null) setRowError({ id: rule.id, error: outcome.error })
  }, [save])

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

  return <Card className={cn('w-full', className)} data-bot-rules>
    <CardHeader>
      <CardTitle>{t('rules.title')}</CardTitle>
      <CardDescription>{t('rules.description')}</CardDescription>
      <CardAction>
        <Button type="button" data-bot-action="add" onClick={() => openForm(null)}>
          <Plus aria-hidden />
          {t('rules.add')}
        </Button>
      </CardAction>
    </CardHeader>

    <CardContent className="flex flex-col gap-4">
      {error != null && <BotErrorNote error={error} variant="alert" />}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-0">#</TableHead>
            <TableHead>{t('rules.name')}</TableHead>
            <TableHead>{t('rules.keywords')}</TableHead>
            <TableHead>{t('rules.action')}</TableHead>
            <TableHead>{t('common.enabled')}</TableHead>
            <TableHead className="w-0"><span className="sr-only">{t('common.edit')}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && items.length === 0
            ? <TableRow>
              <TableCell colSpan={COLUMNS} className="text-muted-foreground py-8 text-center" data-bot-loading>
                <Loader2 className="mx-auto size-4 animate-spin" aria-hidden />
                <span className="sr-only">{t('common.loading')}</span>
              </TableCell>
            </TableRow>
            : items.length === 0
              ? <TableRow>
                <TableCell colSpan={COLUMNS} className="text-muted-foreground py-8 text-center whitespace-normal" data-bot-empty>
                  {t('rules.empty')}
                </TableCell>
              </TableRow>
              : items.map(rule => <TableRow
                key={rule.id}
                data-bot-rule={rule.id}
                data-bot-rule-action={rule.action}
                data-bot-enabled={rule.enabled ? 'true' : 'false'}
                className={cn(!rule.enabled && 'text-muted-foreground')}
              >
                <TableCell className="text-muted-foreground tabular-nums">{rule.order}</TableCell>
                <TableCell className="max-w-[16rem] whitespace-normal">
                  <div className="font-medium break-words" data-bot-rule-name>{rule.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {t(`mode.${rule.mode}`)}
                    {' · '}
                    {rule.connection != null
                      ? labels.get(rule.connection) ?? rule.connection
                      : t('common.all-connections')}
                  </div>
                  {rowError?.id === rule.id && <BotErrorNote error={rowError.error} />}
                </TableCell>
                <TableCell className="max-w-[20rem] whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    {rule.keywords.slice(0, ROW_KEYWORDS).map(keyword => <Badge
                      key={keyword} variant="secondary" className="max-w-full rounded-full" data-bot-keyword={keyword}
                    >
                      <span className="truncate">{keyword}</span>
                    </Badge>)}
                    {rule.keywords.length > ROW_KEYWORDS && <Badge variant="outline" className="rounded-full">
                      {t('rules.more', { count: rule.keywords.length - ROW_KEYWORDS })}
                    </Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full" data-bot-rule-action-pill>
                    {t(`rule-action.${rule.action}`)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={rule.enabled} data-bot-action="toggle" aria-label={t('common.enabled')}
                    onCheckedChange={() => { void toggle(rule) }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button" variant="ghost" size="icon" data-bot-action="edit"
                      aria-label={t('common.edit')} title={t('common.edit')} onClick={() => openForm(rule)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button" variant="ghost" size="icon" data-bot-action="remove" className="text-destructive"
                      aria-label={t('common.remove')} title={t('common.remove')}
                      onClick={() => { setRemoveError(null); setRemoving(rule) }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>)}
        </TableBody>
      </Table>
    </CardContent>

    <RuleForm
      key={formKey}
      open={formOpen}
      editing={editing}
      actions={actions}
      connections={connections}
      connection={connection}
      nextOrder={botViewHelper.nextOrder(items)}
      onSave={save}
      onClose={() => setFormOpen(false)}
    />

    <ConfirmDialog
      open={removing != null}
      title={t('rules.remove-title')}
      description={t('rules.remove-description', { name: removing?.name ?? '' })}
      confirm={t('common.remove')}
      busy={removeBusy}
      error={removeError}
      onConfirm={() => { void confirmRemove() }}
      onCancel={() => setRemoving(null)}
    />
  </Card>
}
