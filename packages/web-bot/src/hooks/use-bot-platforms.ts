import { useCallback, useEffect, useMemo, useState } from 'react'
import { useContext } from '@owlmeans/client'
import type { BotPlatformDescriptor, BotPlatformId } from '@owlmeans/bot'
import { botOutcomeUtils } from '../utils/outcome.js'
import { botPlatformCacheUtils } from '../utils/platforms.js'
import type { BotSurface, UseBotPlatforms } from '../types.js'

/**
 * The platforms the server registered a plugin for — what a new connection may be made on, and what
 * names, draws and explains every connection and activity row — read from the surface's
 * `platform.list` once per surface and shared by every hook over it.
 *
 * A tree without `platform.list` (restated before the leaf existed) answers no platform and no error.
 */
export const useBotPlatforms = (surface: BotSurface): UseBotPlatforms => {
  const ctx = useContext()
  const alias = surface.base.alias
  const leaf = surface.platform?.list
  const [items, setItems] = useState<BotPlatformDescriptor[]>(() => botPlatformCacheUtils.peek(alias) ?? [])
  const [loading, setLoading] = useState(leaf != null && botPlatformCacheUtils.peek(alias) == null)
  const [error, setError] = useState<Error | null>(null)

  const read = useCallback(async (fresh: boolean): Promise<void> => {
    if (leaf == null) {
      setItems([])
      setLoading(false)
      return
    }
    if (fresh) botPlatformCacheUtils.forget(alias)
    setLoading(botPlatformCacheUtils.peek(alias) == null)
    const outcome = await botOutcomeUtils.run(async () => await botPlatformCacheUtils.read(alias, {
      load: async () => await ctx.entrypoint(leaf).call(),
    }))
    if (outcome.ok) {
      setItems(outcome.value ?? [])
      setError(null)
    } else {
      setError(outcome.error ?? null)
    }
    setLoading(false)
  }, [ctx, alias, leaf])

  useEffect(() => { void read(false) }, [read])

  const reload = useCallback(async () => { await read(true) }, [read])

  const byId = useMemo(() => new Map(items.map(descriptor => [descriptor.platform, descriptor])), [items])
  const descriptorOf = useCallback((platform: BotPlatformId) => byId.get(platform) ?? null, [byId])

  return { items, loading, error, reload, descriptorOf }
}
