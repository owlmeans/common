import type { FC } from 'react'
import { useEntrypoint } from '@owlmeans/client'

/** The screen `mount.tsx` loads lazily — a separate module, so it is a separate request. */
export const LazyScreen: FC = () => {
  const { alias } = useEntrypoint()

  return <div id="lazy-screen" data-alias={alias}>lazy-screen</div>
}
