import { astroHelper } from './helper.js'
import type { HeadScripts, HeadScriptsOptions } from './types.js'

export * from './helper.js'

export type { GoogleTagOptions, GtmOptions } from '@owlmeans/web-gtm'
export type { ConsentOptions, ConsentCategory } from '@owlmeans/consent'

export type { AstroHelper, HeadScripts, HeadScriptsOptions } from './types.js'

/** @deprecated compat:factory-refactor — use `astroHelper.owlHeadScripts(…)` */
export const owlHeadScripts = (opts?: HeadScriptsOptions): HeadScripts => astroHelper.owlHeadScripts(opts)

/** @deprecated compat:factory-refactor — use `astroHelper.isLegalPath(…)` */
export const isLegalPath = (pathname: string, segment?: string): boolean => astroHelper.isLegalPath(pathname, segment)

/** @deprecated compat:factory-refactor — use `astroHelper.owlLocale(…)` */
export const owlLocale = (currentLocale: string | undefined, fallback?: string): string =>
  astroHelper.owlLocale(currentLocale, fallback)
