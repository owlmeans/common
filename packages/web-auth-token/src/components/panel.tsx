import { useCallback, useId, useState } from 'react'
import type { FC, FormEvent } from 'react'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { AUTH_TOKEN_NAME_MAX } from '@owlmeans/auth-token'
import { Check, Copy, Loader2, Plus, Trash2 } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '../@/components/ui/alert.js'
import { Badge } from '../@/components/ui/badge.js'
import { Button } from '../@/components/ui/button.js'
import {
  Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle
} from '../@/components/ui/card.js'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '../@/components/ui/dialog.js'
import { Input } from '../@/components/ui/input.js'
import { Label } from '../@/components/ui/label.js'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../@/components/ui/select.js'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '../@/components/ui/table.js'

import { AUTH_TOKEN_I18N, DAY_SECONDS, TOKEN_EXPIRY_CHOICES, TOKEN_EXPIRY_NEVER } from '../consts.js'
import { formatMoment, tokenStatus } from '../helpers.js'
import type { AccessTokenStatus, AccessTokensPanelProps } from '../types.js'

/**
 * A revoked token stays in the list so its name still resolves, and it must not read like a
 * working one — so only `active` gets the filled badge, and the two dead states are quiet.
 */
const STATUS_VARIANT: Record<AccessTokenStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  expired: 'secondary',
  revoked: 'outline',
}

const COLUMNS = 7

/**
 * The access-token management surface.
 *
 * Presentational by contract: it performs no I/O of its own, renders exactly what it is given and
 * reports what the user pressed. `ConnectedAccessTokensPanel` is this component wired to
 * `useAccessTokens`; an application with its own transport mounts this one directly.
 */
export const AccessTokensPanel: FC<AccessTokensPanelProps> = ({
  items, issued, loading, error, onCreate, onRevoke, onDismissIssued, usageHint
}) => {
  const t = useI18nLib(AUTH_TOKEN_I18N, 'panel')
  const [lng] = useLanguage()
  const fieldId = useId()

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState<string>(String(TOKEN_EXPIRY_CHOICES[0]))
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [revoking, setRevoking] = useState(false)

  // An issued token FORCES the dialog open: it exists nowhere else, and a dialog that could be
  // closed while it is set would lose the one copy the user was ever going to see.
  const dialogOpen = createOpen || issued != null

  const closeDialog = useCallback(() => {
    setCreateOpen(false)
    setCopied(false)
    setName('')
    setExpiry(String(TOKEN_EXPIRY_CHOICES[0]))
    if (issued != null) {
      onDismissIssued()
    }
  }, [issued, onDismissIssued])

  const changeDialog = useCallback((next: boolean) => {
    if (next) {
      setCreateOpen(true)
    } else {
      closeDialog()
    }
  }, [closeDialog])

  const submit = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '' || submitting) return
    setSubmitting(true)
    try {
      await onCreate(expiry === TOKEN_EXPIRY_NEVER
        ? { name: trimmed }
        : { name: trimmed, expiresIn: Number(expiry) * DAY_SECONDS })
    } finally {
      setSubmitting(false)
    }
  }, [name, expiry, submitting, onCreate])

  const copy = useCallback(async () => {
    if (issued == null) return
    try {
      await navigator.clipboard?.writeText(issued.token)
      setCopied(true)
    } catch {
      // A missing or refused clipboard (an insecure origin, a denied permission) is not worth a
      // failure banner — the value is on screen and selectable. The button simply doesn't claim a
      // copy it did not make.
    }
  }, [issued])

  const confirmRevoke = useCallback(async () => {
    if (revokeTarget == null || revoking) return
    setRevoking(true)
    try {
      await onRevoke(revokeTarget)
      setRevokeTarget(null)
    } finally {
      setRevoking(false)
    }
  }, [revokeTarget, revoking, onRevoke])

  return <Card>
    <CardHeader>
      <CardTitle>{t('title')}</CardTitle>
      <CardDescription>{t('description')}</CardDescription>
      <CardAction>
        <Button type="button" data-testid="account-token-create" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden />
          {t('create')}
        </Button>
      </CardAction>
    </CardHeader>

    <CardContent className="flex flex-col gap-4">
      {error != null && <Alert variant="destructive">
        <AlertTitle>{t('error')}</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('col.display')}</TableHead>
            <TableHead>{t('col.name')}</TableHead>
            <TableHead>{t('col.created')}</TableHead>
            <TableHead>{t('col.last-used')}</TableHead>
            <TableHead>{t('col.expires')}</TableHead>
            <TableHead>{t('col.status')}</TableHead>
            <TableHead className="w-0"><span className="sr-only">{t('revoke')}</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading === true && items.length === 0
            ? <TableRow>
              <TableCell colSpan={COLUMNS} className="text-muted-foreground py-8 text-center">
                <Loader2 className="mx-auto size-4 animate-spin" aria-hidden />
              </TableCell>
            </TableRow>
            : items.length === 0
              ? <TableRow>
                <TableCell colSpan={COLUMNS} className="text-muted-foreground py-8 text-center">
                  {t('empty')}
                </TableCell>
              </TableRow>
              : items.map(item => {
                const status = tokenStatus(item)

                return <TableRow
                  key={item.id ?? item.display}
                  data-testid="account-token-row"
                  data-token-id={item.id}
                >
                  <TableCell className="font-mono text-xs">{item.display}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{formatMoment(item.createdAt, lng) ?? ''}</TableCell>
                  <TableCell>{formatMoment(item.lastUsedAt, lng) ?? t('never-used')}</TableCell>
                  <TableCell>{formatMoment(item.expiresAt, lng) ?? t('never')}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-testid="account-token-revoke"
                      aria-label={t('revoke')}
                      title={t('revoke')}
                      disabled={status === 'revoked' || item.id == null}
                      onClick={() => { if (item.id != null) setRevokeTarget(item.id) }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              })}
        </TableBody>
      </Table>
    </CardContent>

    <Dialog open={dialogOpen} onOpenChange={changeDialog}>
      <DialogContent closeLabel={t('dialog.cancel')}>
        {issued != null
          ? <>
            <DialogHeader>
              <DialogTitle>{t('dialog.issued-title')}</DialogTitle>
              <DialogDescription>{t('dialog.issued-note')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={issued.token}
                  data-testid="account-token-value"
                  className="font-mono text-xs"
                  onFocus={event => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  data-testid="account-token-copy"
                  onClick={() => { void copy() }}
                >
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? t('dialog.copied') : t('dialog.copy')}
                </Button>
              </div>
              {usageHint != null && usageHint !== ''
                && <p className="text-muted-foreground text-sm">{usageHint}</p>}
            </div>
            <DialogFooter>
              <Button type="button" onClick={closeDialog}>{t('dialog.done')}</Button>
            </DialogFooter>
          </>
          : <form onSubmit={event => { void submit(event) }}>
            <DialogHeader>
              <DialogTitle>{t('dialog.title')}</DialogTitle>
              <DialogDescription>{t('dialog.description')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${fieldId}-name`}>{t('dialog.name-label')}</Label>
                <Input
                  id={`${fieldId}-name`}
                  data-testid="account-token-name"
                  value={name}
                  maxLength={AUTH_TOKEN_NAME_MAX}
                  placeholder={t('dialog.name-placeholder')}
                  onChange={event => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${fieldId}-expiry`}>{t('dialog.expiry-label')}</Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger id={`${fieldId}-expiry`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOKEN_EXPIRY_CHOICES.map(days => <SelectItem key={days} value={String(days)}>
                      {t(`dialog.expiry.${days}`)}
                    </SelectItem>)}
                    <SelectItem value={TOKEN_EXPIRY_NEVER}>{t('dialog.expiry.never')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                {t('dialog.cancel')}
              </Button>
              <Button
                type="submit"
                data-testid="account-token-submit"
                disabled={name.trim() === '' || submitting}
              >
                {submitting && <Loader2 className="animate-spin" aria-hidden />}
                {t('dialog.create')}
              </Button>
            </DialogFooter>
          </form>}
      </DialogContent>
    </Dialog>

    <Dialog
      open={revokeTarget != null}
      onOpenChange={next => { if (!next) setRevokeTarget(null) }}
    >
      <DialogContent closeLabel={t('revoke-confirm.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('revoke-confirm.title')}</DialogTitle>
          <DialogDescription>{t('revoke-confirm.description')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setRevokeTarget(null)}>
            {t('revoke-confirm.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={revoking}
            onClick={() => { void confirmRevoke() }}
          >
            {revoking && <Loader2 className="animate-spin" aria-hidden />}
            {t('revoke-confirm.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>
}
