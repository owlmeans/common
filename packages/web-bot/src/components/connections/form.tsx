import { useCallback, useId, useMemo, useState, type FC, type FormEvent } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import {
  BOT_CREDENTIAL_MAX, BOT_LABEL_MAX, BOT_PLATFORMS, BotPlatform, type BotConnectionInput,
} from '@owlmeans/bot'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Badge } from '../../@/components/ui/badge.js'
import { Button } from '../../@/components/ui/button.js'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../@/components/ui/dialog.js'
import { Input } from '../../@/components/ui/input.js'
import { Label } from '../../@/components/ui/label.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../@/components/ui/select.js'
import { BOT_I18N } from '../../consts.js'
import { botViewHelper } from '../../helpers/view.js'
import { BotErrorNote } from '../shared/error-note.js'
import { PlatformIcon } from '../shared/platform-icon.js'
import { PlatformHint } from './setup.js'
import type { ConnectionFormProps } from './types.js'

/**
 * Connect a bot, or change one. The credential inputs are the platform descriptor's — never a list
 * of this package's own — and they are WRITE-ONLY: a saved value is never shown back, the field
 * only says it is set, and leaving it empty keeps it.
 *
 * Mounted afresh for every opening (the panel keys it), so a half-typed secret never survives a
 * close. It never sends a transport: a new connection is live, and an existing one keeps its own.
 */
export const ConnectionForm: FC<ConnectionFormProps> = ({ open, editing, platforms, onSave, onClose }) => {
  const t = useI18nLib(BOT_I18N)
  const id = useId()

  const [platform, setPlatform] = useState<BotPlatform>(editing?.platform ?? platforms[0] ?? BotPlatform.Telegram)
  const [label, setLabel] = useState(editing?.label ?? '')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const descriptor = BOT_PLATFORMS[platform]
  const fields = useMemo(() => botViewHelper.typedCredentialsOf(platform), [platform])
  const generated = (descriptor?.credentials ?? []).filter(field => field.generated === true)
  const stored = editing?.platform === platform ? editing.credentialsSet : []

  // A bot cannot be verified without its required credentials, so they are asked for here.
  const missing = fields.filter(field =>
    field.required && (values[field.key] ?? '').trim() === '' && !stored.includes(field.key)
  )
  const valid = label.trim() !== '' && missing.length === 0

  const choosePlatform = useCallback((next: string) => {
    setPlatform(next as BotPlatform)
    setValues({})
  }, [])

  const submit = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    if (!valid || saving) return
    const credentials = Object.fromEntries(Object.entries(values)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([key, value]) => value !== '' && fields.some(field => field.key === key)))
    const input: BotConnectionInput = {
      ...(editing != null ? { id: editing.id } : {}),
      platform,
      label: label.trim(),
      ...(Object.keys(credentials).length > 0 ? { credentials } : {}),
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
  }, [valid, saving, values, fields, editing, platform, label, onSave, onClose])

  return <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
    <DialogContent closeLabel={t('common.close')} className="max-h-[calc(100dvh-2rem)] overflow-y-auto" data-bot-connection-form>
      <form className="flex flex-col gap-4" onSubmit={event => { void submit(event) }} noValidate>
        <DialogHeader>
          <DialogTitle>
            {editing != null ? t('form.edit-title', { label: editing.label }) : t('form.add-title')}
          </DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-platform`}>{t('form.platform')}</Label>
          {editing != null || platforms.length === 1
            ? <p id={`${id}-platform`} className="flex items-center gap-2 text-sm" data-bot-input="platform" data-bot-value={platform}>
              <PlatformIcon platform={platform} />
              {descriptor?.title ?? platform}
            </p>
            : <Select value={platform} onValueChange={choosePlatform}>
              <SelectTrigger id={`${id}-platform`} className="w-full" data-bot-input="platform" data-bot-value={platform}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platforms.map(option => <SelectItem key={option} value={option} data-bot-option={option}>
                  <PlatformIcon platform={option} />
                  {BOT_PLATFORMS[option]?.title ?? option}
                </SelectItem>)}
              </SelectContent>
            </Select>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-label`}>{t('form.label')}</Label>
          <Input
            id={`${id}-label`} data-bot-input="label" value={label} maxLength={BOT_LABEL_MAX} required
            placeholder={t('form.label-placeholder')} onChange={event => setLabel(event.target.value)}
          />
        </div>

        <fieldset className="flex flex-col gap-4" data-bot-credentials={platform}>
          <legend className="sr-only">{t('form.credentials')}</legend>
          {fields.map(field => {
            const set = stored.includes(field.key)
            const required = field.required

            return <div key={`${platform}:${field.key}`} className="flex flex-col gap-2">
              <Label htmlFor={`${id}-cred-${field.key}`}>
                {t(`credentials.${platform}.${field.key}.label`, { defaultValue: field.key })}
                {!field.required && <span className="text-muted-foreground font-normal">({t('common.optional')})</span>}
                {set && <Badge variant="secondary" className="rounded-full" data-bot-credential-set={field.key}>
                  {t('form.secret-set')}
                </Badge>}
              </Label>
              <Input
                id={`${id}-cred-${field.key}`}
                data-bot-field={field.key}
                type={field.secret ? 'password' : 'text'}
                autoComplete={field.secret ? 'new-password' : 'off'}
                spellCheck={false}
                maxLength={BOT_CREDENTIAL_MAX}
                aria-required={required && !set}
                value={values[field.key] ?? ''}
                placeholder={set ? t('form.secret-keep') : ''}
                onChange={event => {
                  const next = event.target.value
                  setValues(current => ({ ...current, [field.key]: next }))
                }}
              />
              <p className="text-muted-foreground text-xs">
                {t(`credentials.${platform}.${field.key}.hint`, { defaultValue: '' })}
              </p>
            </div>
          })}
          {generated.map(field => <p key={field.key} className="text-muted-foreground text-xs" data-bot-generated={field.key}>
            <span className="text-foreground font-medium">
              {t(`credentials.${platform}.${field.key}.label`, { defaultValue: field.key })}
            </span>
            {' — '}
            {t('form.generated')}
          </p>)}
        </fieldset>

        <PlatformHint
          platform={platform}
          beforeSave
          applicationId={platform === BotPlatform.Discord ? values.applicationId ?? editing?.identity?.id : null}
        />

        {descriptor?.docs != null && <a
          href={descriptor.docs} target="_blank" rel="noopener noreferrer" data-bot-docs
          className="inline-flex w-fit items-center gap-1 text-sm underline underline-offset-4"
        >
          {t('form.docs', { platform: descriptor.title })}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>}

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
