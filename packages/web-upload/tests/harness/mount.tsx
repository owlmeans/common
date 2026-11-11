import '../../src/@/globals.css'

import { useState } from 'react'
import type { FC } from 'react'
import { createRoot } from 'react-dom/client'
import { Context, makeClientContext } from '@owlmeans/client'
import { config } from '@owlmeans/client-context'
import type { ClientConfig } from '@owlmeans/client-context'
import { bindAll } from '@owlmeans/client-entrypoint'
import { I18nContext } from '@owlmeans/client-i18n'
import { makeUploadClient } from '@owlmeans/client-upload'
import { AppType } from '@owlmeans/context'
import type { UploadPolicy } from '@owlmeans/upload'
import {
  createUploadQueueStore, UploadDropzone, UploadList, UploadPickers, useUploadI18n, useUploadQueue,
} from '../../src/index.js'
import { HARNESS_POLICY, HARNESS_SERVER, harnessTree } from './tree.js'

// A home-screen-like form: the whole form is the drop zone; the queue is filled before any session
// exists, and "Create" opens one and uploads into it. The spec picks the policy and the language.

const params = new URLSearchParams(window.location.search)
const port = Number(params.get('api') ?? '0')
const policy: Partial<UploadPolicy> = params.has('policy') ? JSON.parse(params.get('policy')!) : HARNESS_POLICY
const language = params.get('lng')
try {
  if (language != null) {
    localStorage.setItem('owlmeans-lng', language)
  } else {
    localStorage.removeItem('owlmeans-lng')
  }
} catch {}

const cfg = config<ClientConfig>('web-upload-harness', {
  services: { [HARNESS_SERVER]: { service: HARNESS_SERVER, type: AppType.Backend, host: '127.0.0.1', port, default: true } },
  security: { unsecure: true },
} as unknown as Partial<ClientConfig>)
const context = makeClientContext(cfg)
context.registerEntrypoints(bindAll(harnessTree))
context.configure()
await context.init()
const uploads = makeUploadClient(context, harnessTree)

/** What the spec reads back: every progress value the queue reported, by path. */
const trace: Record<string, number[]> = {}
/** `?store`: a queue held outside React, rendered by the hook. */
const store = params.has('store') ? createUploadQueueStore({ policy, client: uploads }) : undefined
Object.assign(window, { __uploadTrace: trace, __uploadStore: store })

const Form: FC = () => {
  const i18n = useUploadI18n()
  const queue = useUploadQueue({ policy, protocols: harnessTree, store })
  const [session, setSession] = useState('')
  for (const entry of queue.entries) {
    const seen = (trace[entry.path] ??= [])
    if (seen.at(-1) !== entry.progress) seen.push(entry.progress)
  }

  const create = async (): Promise<void> => {
    const opened = await uploads.open()
    setSession(opened.id)
    await queue.start(opened.id)
  }

  return <main className="mx-auto max-w-2xl p-4">
    <UploadDropzone queue={queue} className="rounded-xl border bg-card p-4" {...i18n}>
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void create() }}>
        <textarea aria-label="Describe your app" data-testid="prompt" className="min-h-24 rounded-md border p-2" />
        <UploadPickers queue={queue} {...i18n} />
        <UploadList queue={queue} {...i18n} />
        <div className="flex items-center gap-3">
          <button type="submit" data-testid="create" className="h-9 rounded-md bg-primary px-4 text-primary-foreground">Create</button>
          <output data-testid="session">{session}</output>
          <output data-testid="uploading">{queue.uploading ? 'yes' : 'no'}</output>
        </div>
      </form>
    </UploadDropzone>
  </main>
}

createRoot(document.getElementById('root')!).render(
  <Context value={context}>
    <I18nContext config={context.cfg}>
      <Form />
    </I18nContext>
  </Context>,
)
