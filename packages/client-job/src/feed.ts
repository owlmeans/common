import { useEffect, useMemo, useState } from 'react'
import { useContext } from '@owlmeans/client'
import { useWs } from '@owlmeans/client-auth'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { JobEvent, JobRecord } from '@owlmeans/queue'
import type { ListResult } from '@owlmeans/resource'
import { DEFAULT_JOB_ROOT, JOBS, JOB_EVENT } from './consts.js'
import { jobEntrypointAliases } from './helper.js'
import type { Config, Context, JobFeed, JobFeedOptions } from './types.js'
import { applyJobEvent } from './utils/index.js'

/**
 * Mount the job feed: one socket, seeded once from the list entrypoint.
 *
 * Mount it ONCE per screen that shows jobs — every call opens its own socket, and two feeds mean
 * the server fans the same events out twice. Everything else reads the store through
 * {@link useJob} / {@link useJobs}, so nothing else in the tree needs the connection.
 *
 * The seed is `replace`, not a run of saves: it is the server saying what exists, so a job
 * cancelled from another tab has to LEAVE the store, and one write wakes the subscribers once.
 * The socket is opened by `@owlmeans/client-auth`'s `useWs`, which puts the current token on the
 * connection query — the watch entrypoint is guarded, and ownership is derived from that token.
 */
export const useJobFeed = (opts?: JobFeedOptions): JobFeed => {
  const context = useContext<Config, Context>()
  const alias = opts?.resource ?? JOBS
  const aliases = useMemo(
    () => jobEntrypointAliases(opts?.root ?? DEFAULT_JOB_ROOT), [opts?.root]
  )
  const connection = useWs(aliases.watch)
  const [seed, setSeed] = useState<Pick<JobFeed, 'seeded' | 'error'>>({ seeded: false, error: null })
  // The seeding query is compared by CONTENT: a screen that narrows its filter re-seeds, while a
  // caller passing a fresh object literal every render does not re-fetch on every render.
  const query = JSON.stringify(opts?.query ?? null)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const result = await context.entrypoint<ClientEntrypoint<ListResult<JobRecord>>>(aliases.list)
          .call<ListResult<JobRecord>>({ query: opts?.query })
        if (!live) {
          return
        }
        await context.getStateResource(alias).replace(result.items)
        setSeed({ seeded: true, error: null })
      } catch (e) {
        if (live) {
          setSeed({ seeded: false, error: e as Error })
        }
      }
    })()

    return () => { live = false }
  }, [context, aliases.list, alias, query])

  useEffect(() => {
    if (connection == null) {
      return
    }
    const store = context.getStateResource(alias)
    const unsubscribe = connection.observe<JobEvent>(JOB_EVENT, async message => {
      try {
        await applyJobEvent(store, message.payload)
      } catch (e) {
        console.error('Job feed apply error:', e)
      }
    })

    return () => unsubscribe()
  }, [connection, context, alias])

  return { connected: connection != null, ...seed }
}
