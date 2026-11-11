import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useContext } from '@owlmeans/client'
import { useI18nLib, useLanguage } from '@owlmeans/client-i18n'
import { makeUploadClient } from '@owlmeans/client-upload'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { WEB_UPLOAD_RESOURCE } from './consts.js'
import { createUploadQueueStore } from './store.js'
import type { UploadI18n, UploadQueue, UploadQueueOptions, UploadTranslate } from './types.js'

/**
 * A headless upload queue for a component: add files (or a drop), see them prechecked against the
 * policy, then `start(sessionId)` once a session exists. The client is `client`, or one made over
 * `protocols` in the React context (or `context`). Pass `store` to render a queue that lives
 * outside the component.
 */
export const useUploadQueue = (options: UploadQueueOptions = {}): UploadQueue => {
  const { store: external, protocols, context: given, client: own, ...settings } = options
  const reactContext = useContext()
  const context = (given ?? reactContext) as unknown as BasicContext<BasicConfig>
  const client = useMemo(
    () => own ?? (protocols != null ? makeUploadClient(context, protocols) : undefined), [own, protocols, context],
  )
  const [created] = useState(() => createUploadQueueStore({ ...settings, client }))
  const store = external ?? created

  const policyKey = JSON.stringify(settings.policy ?? null)
  const ignoreKey = settings.ignore?.join('\n')
  useEffect(() => {
    store.configure({
      ...(settings.policy != null ? { policy: settings.policy } : {}),
      ...(client != null ? { client } : {}),
      ...(settings.concurrency != null ? { concurrency: settings.concurrency } : {}),
      ...(settings.retries != null ? { retries: settings.retries } : {}),
      ...(settings.ignore != null ? { ignore: settings.ignore } : {}),
      ...(settings.collectLimit != null ? { collectLimit: settings.collectLimit } : {}),
    })
    // The policy and the ignore list are compared by value: an inline object is a new one every render.
  }, [store, client, policyKey, ignoreKey, settings.concurrency, settings.retries, settings.collectLimit])

  const state = useSyncExternalStore(store.subscribe, store.state, store.state)

  return useMemo<UploadQueue>(() => ({
    ...state, add: store.add, remove: store.remove, clear: store.clear, start: store.start, abort: store.abort,
  }), [state, store])
}

/**
 * The parts' `translate` over the packaged eight-language bundle (`lib:web-upload`) and the current
 * language as `locale` — spread it onto every part: `<UploadList queue={queue} {...useUploadI18n()} />`.
 * It needs the application's i18n instance (`PanelApp` / `render()` / `I18nContext`), which is why no
 * part calls it by itself. Missing keys fall back to English.
 */
export const useUploadI18n = (): Required<UploadI18n> => {
  const t = useI18nLib(WEB_UPLOAD_RESOURCE)
  const [locale] = useLanguage()
  // React escapes what it renders; i18next escaping on top would print `&#x2F;` for a slash in a path.
  const translate = useCallback<UploadTranslate>(
    (key, fallback) => t(key, { defaultValue: fallback, interpolation: { escapeValue: false } }), [t],
  )

  return useMemo(() => ({ translate, locale: locale ?? 'en' }), [translate, locale])
}
