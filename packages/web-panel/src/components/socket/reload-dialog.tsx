import type { FC } from 'react'
import { useSocketStatus } from '@owlmeans/client-socket'
import { useI18nLib } from '@owlmeans/client-i18n'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '../../@/components/ui/alert-dialog.js'

/**
 * A global, blocking "reload the page" prompt — opt in per app with `cfg.socket.reloadDialog`.
 *
 * Mount it once, above the router (`PanelApp` does), exactly like `PanelCookieConsent`: a dialog
 * mounted inside a route is torn down on every navigation, and this one is meant to survive them
 * all. It opens the moment `useSocketStatus()` reports `'lost'` — every `ws()`/`useWs()`
 * connection in the app has exhausted its own retry budget (10 minutes by default) — and it never
 * closes on its own: there is nothing left retrying that a countdown or a poll could wait out, so
 * the only exit this dialog offers is the one that actually fixes it.
 *
 * Non-dismissible on two levels: Radix's `AlertDialogContent` (unlike its plain `Dialog` sibling)
 * never treats an outside click as a request to close, so there is no `onPointerDownOutside` to
 * override in the first place — and `open` is passed with no `onOpenChange` at all, so even the
 * Escape key it does listen for (blocked below anyway) has no handler to call.
 */
export const SocketReloadDialog: FC = () => {
  const status = useSocketStatus()
  const t = useI18nLib('socket', 'reload')
  const open = status === 'lost'

  return <AlertDialog open={open}>
    <AlertDialogContent
      data-socket-reload-dialog
      onEscapeKeyDown={event => event.preventDefault()}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{t('title')}</AlertDialogTitle>
        <AlertDialogDescription>{t('description')}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction data-socket-reload-action onClick={() => window.location.reload()}>
          {t('action')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
