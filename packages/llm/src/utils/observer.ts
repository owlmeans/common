import type { LlmFetch } from '../plugins/transport/types.js'
import type { LlmStreamResume } from '../plugins/types.js'
import { fetchUtils } from './fetch.js'
import type { AttemptObserver, ObserverListener, ObserverUtils } from './observer/types.js'

export const createObserverUtils = (): ObserverUtils => {
  const of = (onResume?: (event: LlmStreamResume) => void): AttemptObserver => {
    let armed = true
    let fetched = false
    let listener: ObserverListener | undefined

    /** The body as the client reads it — pulled one read at a time, every non-empty read noted. */
    const watched = (body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> => {
      const reader = body.getReader()

      return new ReadableStream<Uint8Array>({
        pull: async controller => {
          try {
            const { done, value } = await reader.read()
            if (done) {
              controller.close()
              return
            }
            if (armed && value.byteLength > 0) listener?.received()
            controller.enqueue(value)
          } catch (error) {
            controller.error(error)
          }
        },
        cancel: reason => reader.cancel(reason),
      })
    }

    const wrap = (fetch: LlmFetch = fetchUtils.global): LlmFetch => async (input, init) => {
      if (armed) {
        fetched = true
        listener?.fetched()
      }
      const response = await fetch(input, init)

      return response.body != null ? fetchUtils.withBody(response, watched(response.body)) : response
    }

    const resumed = (event: LlmStreamResume): void => {
      if (armed) onResume?.(event)
    }

    return {
      wrap,
      resumed,
      fetched: () => fetched,
      listen: next => { listener = next },
      disarm: () => {
        armed = false
        listener = undefined
      },
    }
  }

  return { of }
}

export const observerUtils = createObserverUtils()
