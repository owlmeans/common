import type { ClientConfig } from '@owlmeans/client-context'
import { AppType, CONFIG_RECORD } from '@owlmeans/context'

export const defaultCfg: ClientConfig = {
  services: {},
  brand: {},
  trusted: [],
  [CONFIG_RECORD]: [],
  ready: false,
  service: '',
  debug: {},
  type: AppType.Frontend,
}

/**
 * What a browser says when a dynamic `import()` could not fetch its module — Chromium, Safari and
 * Firefox, in that order — and what Vite's preload helper says when a chunk's stylesheet could not.
 */
export const CHUNK_FAILURE = /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i

/** The module URL a Chromium or Firefox import failure names; Safari's message names none. */
export const FAILED_URL = /dynamically imported module:?\s+(\S+)/i
