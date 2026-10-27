import type { ThirdPartyNoticesOptions, ThirdPartyNoticesPlugin } from './notices/types.js'
export type { ThirdPartyNoticesOptions, ThirdPartyNoticesPlugin } from './notices/types.js'

/** Collect the licenses accompanying the code and assets actually included in this build. */
export declare const createThirdPartyNoticesPlugin: (options: ThirdPartyNoticesOptions) => ThirdPartyNoticesPlugin
