import { useCallback, useId, useMemo, useState, type FC, type FormEvent } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import {
  BOT_INSTRUCTION_MAX, BOT_REPLY_MAX, BOT_RULE_NAME_MAX, BOT_TEXT_MAX, BotMatchMode, BotRuleAction, botRuleHelper,
  type BotRule, type BotRuleInput,
} from '@owlmeans/bot'
import { Loader2 } from 'lucide-react'
import { Button } from '../../@/components/ui/button.js'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../@/components/ui/dialog.js'
import { Input } from '../../@/components/ui/input.js'
import { Label } from '../../@/components/ui/label.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../@/components/ui/select.js'
import { Switch } from '../../@/components/ui/switch.js'
import { Textarea } from '../../@/components/ui/textarea.js'
import { BOT_I18N, BOT_TEXT_ACTIONS, BOT_TEXT_REQUIRED_ACTIONS } from '../../consts.js'
import { botViewHelper } from '../../helpers/view.js'
import { BotErrorNote } from '../shared/error-note.js'
import { Segmented } from '../shared/segmented.js'
import { ALL_CONNECTIONS } from './consts.local.js'
import { KeywordInput } from './keywords.js'
import type { RuleFormProps } from './types.js'

/**
 * One keyword group: its keywords, how they are compared, what the bot does with a message that
 * matches them — the kit's actions only — and the text or instruction that goes with it. A message
 * typed into "Try it" is matched by the SAME matcher the bot uses, so what it says is what the bot
 * will do.
 */
export const RuleForm: FC<RuleFormProps> = ({
  open, editing, actions, connections, connection, nextOrder, onSave, onClose,
}) => {
  const t = useI18nLib(BOT_I18N)
  const id = useId()

  // The kit's actions, plus the one an existing group already has — a group made before the kit
  // changed still opens showing what it does.
  const choices = useMemo(() => editing != null && !actions.includes(editing.action)
    ? [...actions, editing.action]
    : actions, [actions, editing])

  const [name, setName] = useState(editing?.name ?? '')
  const [keywords, setKeywords] = useState<string[]>(editing?.keywords ?? [])
  const [pending, setPending] = useState('')
  const [mode, setMode] = useState<BotMatchMode>(editing?.mode ?? BotMatchMode.Word)
  const [action, setAction] = useState<BotRuleAction>(editing?.action ?? choices[0] ?? BotRuleAction.Reply)
  const [reply, setReply] = useState(editing?.reply ?? '')
  const [instruction, setInstruction] = useState(editing?.instruction ?? '')
  const [target, setTarget] = useState<string>(
    editing != null ? editing.connection ?? ALL_CONNECTIONS : connection ?? ALL_CONNECTIONS
  )
  const [enabled, setEnabled] = useState(editing?.enabled ?? true)
  const [order, setOrder] = useState(String(editing?.order ?? nextOrder))
  const [sample, setSample] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const allKeywords = useMemo(
    () => botRuleHelper.normalizeKeywords([...keywords, ...botViewHelper.splitKeywords(pending)]),
    [keywords, pending]
  )
  const texted = BOT_TEXT_ACTIONS.includes(action)
  const agent = action === BotRuleAction.Agent
  const valid = name.trim() !== '' && allKeywords.length > 0
    && (!BOT_TEXT_REQUIRED_ACTIONS.includes(action) || reply.trim() !== '')
    && (!agent || instruction.trim() !== '')
    && Number.isInteger(Number(order)) && Number(order) >= 0

  const trial = useMemo(() => {
    if (sample.trim() === '' || allKeywords.length === 0) return null
    const draft: BotRule = {
      id: 'draft', scope: '', name, keywords: allKeywords, mode, action, enabled: true, order: 0,
      createdAt: '', updatedAt: '',
    }

    return botRuleHelper.match(sample, [draft])[0]?.keywords ?? []
  }, [sample, allKeywords, name, mode, action])

  const submit = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || saving) return
    const input: BotRuleInput = {
      ...(editing != null ? { id: editing.id } : {}),
      connection: target === ALL_CONNECTIONS ? null : target,
      name: name.trim(),
      keywords: allKeywords,
      mode,
      action,
      ...(texted && reply.trim() !== '' ? { reply: reply.trim() } : {}),
      ...(instruction.trim() !== '' ? { instruction: instruction.trim() } : {}),
      enabled,
      order: Number(order),
    }
    setSaving(true)
    setError(null)
    try {
      const outcome = await onSave(input)
      if (outcome.ok) {
        onClose()
      } else {
        setError(outcome.error ?? null)
      }
    } finally {
      setSaving(false)
    }
  }, [valid, saving, editing, target, name, allKeywords, mode, action, texted, reply, instruction, enabled, order, onSave, onClose])

  return <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
    <DialogContent closeLabel={t('common.close')} className="max-h-[calc(100dvh-2rem)] overflow-y-auto" data-bot-rule-form>
      <form className="flex flex-col gap-4" onSubmit={event => { void submit(event) }} noValidate>
        <DialogHeader>
          <DialogTitle>{editing != null ? t('rules.edit-title', { name: editing.name }) : t('rules.add-title')}</DialogTitle>
          <DialogDescription>{t('rules.form-description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-name`}>{t('rules.name')}</Label>
          <Input
            id={`${id}-name`} data-bot-input="name" value={name} maxLength={BOT_RULE_NAME_MAX} required
            placeholder={t('rules.name-placeholder')} onChange={event => setName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-keywords`}>{t('rules.keywords')}</Label>
          <KeywordInput
            id={`${id}-keywords`} value={keywords} onChange={setKeywords} pending={pending}
            onPendingChange={setPending} placeholder={t('rules.keywords-placeholder')}
          />
          <p className="text-muted-foreground text-xs">{t('rules.keywords-hint')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm leading-none font-medium">{t('rules.mode')}</p>
          <Segmented
            name="mode" label={t('rules.mode')} value={mode} onChange={setMode}
            options={[
              { value: BotMatchMode.Word, label: t('mode.word') },
              { value: BotMatchMode.Contains, label: t('mode.contains') },
            ]}
          />
          <p className="text-muted-foreground text-xs">{t(`mode-hint.${mode}`)}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-action`}>{t('rules.action')}</Label>
          {choices.length === 1
            ? <p id={`${id}-action`} className="text-sm" data-bot-input="action" data-bot-value={action}>
              {t(`rule-action.${action}`)}
            </p>
            : <Select value={action} onValueChange={next => setAction(next as BotRuleAction)}>
              <SelectTrigger id={`${id}-action`} className="w-full" data-bot-input="action" data-bot-value={action}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {choices.map(choice => <SelectItem key={choice} value={choice} data-bot-option={choice}>
                  {t(`rule-action.${choice}`)}
                </SelectItem>)}
              </SelectContent>
            </Select>}
        </div>

        {texted && <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-reply`}>
            {t(`rules.reply.${action}`)}
            {!BOT_TEXT_REQUIRED_ACTIONS.includes(action) && <span className="text-muted-foreground font-normal">({t('common.optional')})</span>}
          </Label>
          <Textarea
            id={`${id}-reply`} data-bot-input="reply" value={reply} maxLength={BOT_REPLY_MAX} rows={3}
            onChange={event => setReply(event.target.value)}
          />
        </div>}

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-instruction`}>
            {t('rules.instruction')}
            {!agent && <span className="text-muted-foreground font-normal">({t('common.optional')})</span>}
          </Label>
          <Textarea
            id={`${id}-instruction`} data-bot-input="instruction" value={instruction} maxLength={BOT_INSTRUCTION_MAX}
            rows={agent ? 4 : 2} placeholder={t('rules.instruction-placeholder')}
            onChange={event => setInstruction(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t(agent ? 'rules.instruction-hint-agent' : 'rules.instruction-hint')}</p>
        </div>

        {connections.length > 0 && <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-connection`}>{t('rules.applies-to')}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id={`${id}-connection`} className="w-full" data-bot-input="connection" data-bot-value={target}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CONNECTIONS} data-bot-option={ALL_CONNECTIONS}>{t('common.all-connections')}</SelectItem>
              {connections.map(entry => <SelectItem key={entry.id} value={entry.id} data-bot-option={entry.id}>
                {entry.label}
              </SelectItem>)}
              {target !== ALL_CONNECTIONS && !connections.some(entry => entry.id === target)
                && <SelectItem value={target}>{target}</SelectItem>}
            </SelectContent>
          </Select>
        </div>}

        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-order`}>{t('rules.order')}</Label>
            <Input
              id={`${id}-order`} data-bot-input="order" type="number" inputMode="numeric" min={0} step={1}
              className="w-24" value={order} onChange={event => setOrder(event.target.value)}
            />
          </div>
          <label className="flex h-9 items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} data-bot-input="enabled" aria-label={t('common.enabled')} />
            {t('common.enabled')}
          </label>
        </div>

        <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
          <Label htmlFor={`${id}-try`}>{t('rules.try')}</Label>
          <Input
            id={`${id}-try`} data-bot-input="try" value={sample} maxLength={BOT_TEXT_MAX}
            placeholder={t('rules.try-placeholder')} onChange={event => setSample(event.target.value)}
          />
          {trial != null && <p className="text-sm" data-bot-rule-try={trial.length > 0 ? 'match' : 'none'}>
            {trial.length > 0 ? t('rules.try-match', { keywords: trial.join(', ') }) : t('rules.try-none')}
          </p>}
        </div>

        <BotErrorNote error={error} />

        <DialogFooter>
          <Button type="button" variant="outline" data-bot-action="cancel" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" data-bot-action="save" disabled={!valid || saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
