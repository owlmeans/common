import { LOGIN_WATCH_INTERVAL, LoginOutcome } from '@owlmeans/client-auth/login'

/**
 * Wait on a surrogate window until it says something, or goes away.
 *
 * Extracted so login and logout share one implementation rather than two that agree until one of
 * them is changed. Every guard here was a real failure at some point:
 *
 * - the **origin pin** is not decoration — the message carries a bearer token, and a listener that
 *   accepted any origin would take one from any page that could reach this window;
 * - the **`settled` latch** stops a second message, or a close racing a message, resolving twice;
 * - the **`closed` poll** is the only exit when the user simply closes the window, because a window
 *   the user closes announces nothing at all;
 * - the listener and the interval are removed on every path, including the ones that resolve.
 */
export const awaitSurrogate = async (
  surrogate: Window,
  messageType: string,
  onMessage: (data: { type?: string, token?: string, ok?: boolean }) => Promise<LoginOutcome>
): Promise<LoginOutcome> => await new Promise<LoginOutcome>(resolve => {
  let settled = false
  let watch: ReturnType<typeof setInterval> | undefined

  const finish = (result: LoginOutcome): void => {
    if (settled) {
      return
    }
    settled = true
    window.removeEventListener('message', handler)
    if (watch != null) {
      clearInterval(watch)
    }
    resolve(result)
  }

  function handler(event: MessageEvent): void {
    if (event.origin !== window.location.origin) {
      return
    }
    const data = event.data as { type?: string, token?: string, ok?: boolean } | null
    if (data?.type !== messageType) {
      return
    }
    void onMessage(data).then(finish).catch(() => finish(LoginOutcome.Failed))
  }

  window.addEventListener('message', handler)
  watch = setInterval(() => {
    if (surrogate.closed) {
      finish(LoginOutcome.Failed)
    }
  }, LOGIN_WATCH_INTERVAL)
})
