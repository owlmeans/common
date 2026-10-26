export interface ThirdPartyNoticesOptions {
  /** Package directory whose build is being configured. */
  root: string
  /** Asset name relative to the bundle directory. */
  fileName?: string
  /** Packages contributing CSS, fonts or generated helpers outside the JS graph. */
  additionalPackages?: string[]
  /** Copied-source notices, resolved relative to root. */
  additionalFiles?: string[]
  /** Notices accompanying independently loaded runtime bundles. */
  references?: string[]
}

export interface ThirdPartyNoticesPlugin {
  name: string
  generateBundle: (
    this: {
      emitFile: (asset: { type: 'asset', fileName: string, source: string }) => string
    },
    options: unknown,
    bundle: Record<string, {
      type: string
      modules?: Record<string, unknown>
      moduleIds?: string[]
      code?: string
    }>
  ) => void
}
