import type { FC } from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'
import { Loader2 } from 'lucide-react'
import { Button } from '../../@/components/ui/button.js'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../@/components/ui/dialog.js'
import { BOT_I18N } from '../../consts.js'
import { BotErrorNote } from './error-note.js'
import type { ConfirmDialogProps } from './types.js'

/** "Remove this?" — the one destructive confirmation the panels share. */
export const ConfirmDialog: FC<ConfirmDialogProps> = ({
  open, title, description, confirm, busy, error, onConfirm, onCancel,
}) => {
  const t = useI18nLib(BOT_I18N, 'common')

  return <Dialog open={open} onOpenChange={next => { if (!next) onCancel() }}>
    <DialogContent closeLabel={t('close')} data-bot-confirm>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <BotErrorNote error={error} />
      <DialogFooter>
        <Button type="button" variant="outline" data-bot-action="cancel" onClick={onCancel}>{t('cancel')}</Button>
        <Button
          type="button" variant="destructive" data-bot-action="confirm-remove" disabled={busy === true}
          onClick={onConfirm}
        >
          {busy === true && <Loader2 className="animate-spin" aria-hidden />}
          {confirm}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
