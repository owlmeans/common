import type { FC } from 'react'
import { useSocketRetry, useSocketStatus } from '@owlmeans/client-socket'
import { useI18nLib } from '@owlmeans/client-i18n'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '../../@/components/ui/alert-dialog.js'
import { Button } from '../../@/components/ui/button.js'

/**
 * A global, blocking "connection lost" prompt — opt in per app with `cfg.socket.reloadDialog`.
 *
 * Mount it once, above the router (`PanelApp` does), exactly like `PanelCookieConsent`: a dialog
 * mounted inside a route is torn down on every navigation, and this one is meant to survive them
 * all. It opens the moment `useSocketStatus()` reports `'lost'` — every `ws()`/`useWs()`
 * connection in the app has exhausted its own retry budget (10 minutes by default).
 *
 * Two exits: "Try again" revives every lost connection (`useSocketRetry()`), and the dialog stays
 * up showing progress until they are back online — or offers both buttons again if they are lost
 * again. "Reload page" is the fallback that always works. The status service also retries by
 * itself when the tab or window becomes active, so a socket that died in a background tab is
 * usually back before anyone has to press anything.
 *
 * Non-dismissible on two levels: Radix's `AlertDialogContent` (unlike its plain `Dialog` sibling)
 * never treats an outside click as a request to close, so there is no `onPointerDownOutside` to
 * override in the first place — and `open` is passed with no `onOpenChange` at all, so even the
 * Escape key it does listen for (blocked below anyway) has no handler to call.
 */
export const SocketReloadDialog: FC = () => {
  const status = useSocketStatus()
  const { retry, retrying } = useSocketRetry()
  const t = useI18nLib('socket', 'reload')
  const open = status === 'lost' || (retrying && status === 'reconnecting')
  // Closing still animates the content out — keep the retry in its busy state until it is gone.
  const busy = retrying || !open

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
        <Button variant="outline" data-socket-reload-action onClick={() => window.location.reload()}>
          {t('action')}
        </Button>
        <AlertDialogAction
          data-socket-retry-action
          disabled={busy}
          aria-busy={busy}
          onClick={retry}
        >
          {busy ? t('retrying') : t('retry')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
