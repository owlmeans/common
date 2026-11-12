import type { CaptchaClient } from '../src/types.js'

export interface TestClient extends CaptchaClient {
  /** Every site key `load` was called with. */
  loaded: string[]
}

/** A client that answers `token:<siteKey>:<action>` — no page, no script, nothing provider-specific. */
export const makeTestClient = (id: string = 'test', patch: Partial<CaptchaClient> = {}): TestClient => {
  const loaded: string[] = []

  return {
    id,
    loaded,
    load: async siteKey => { loaded.push(siteKey) },
    execute: async (siteKey, action) => `token:${siteKey}:${action}`,
    ...patch,
  }
}
