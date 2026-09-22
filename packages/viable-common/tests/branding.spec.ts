import { describe, expect, it } from 'bun:test'

import { BRANDING_ENV_KEYS, brandingEnv } from '../src/branding.js'
import { metadataConfigs, metadataLists } from '../src/consts.js'

/**
 * `BRANDING_CREDIT` is the one key whose ABSENCE means something different from an explicit
 * empty string — the platform side of the bug this pins: `brandingCredit: ''` stored to hide the
 * platform credit must survive as `BRANDING_CREDIT: ''`, not fall back to the "shown" default.
 */
describe('brandingEnv', () => {
  it('emits an empty BRANDING_CREDIT for an explicitly hidden credit', () => {
    expect(brandingEnv({ brandingCredit: '' }).BRANDING_CREDIT).toBe('')
  })

  it('emits BRANDING_CREDIT=1 when the credit is shown', () => {
    expect(brandingEnv({ brandingCredit: '1' }).BRANDING_CREDIT).toBe('1')
  })

  it('defaults to shown (BRANDING_CREDIT=1) when nothing was ever delivered', () => {
    // The safe direction: a delivery that lost the value keeps the credit rather than
    // silently giving away a paid feature.
    expect(brandingEnv({}).BRANDING_CREDIT).toBe('1')
  })

  it('composes the rest of the branding env from whatever is present, blank otherwise', () => {
    expect(brandingEnv({
      brandingCopyright: '© 2026 Acme', projectName: 'Acme CRM',
    })).toEqual({
      BRANDING_COPYRIGHT: '© 2026 Acme',
      BRANDING_ORGANIZATION: '',
      BRANDING_TERMS_URL: '',
      BRANDING_PRIVACY_URL: '',
      BRANDING_CREDIT: '1',
      BRANDING_PRODUCT: 'Acme CRM',
      BRANDING_GOOGLE_TAG: '',
    })
  })

  it('carries the Google tag, and emits it empty when none is set', () => {
    // The METADATA key is omitted from a push while unset (an older publisher refuses it); the
    // ENVIRONMENT key is always there, and '' is what tells the build to load no tag.
    expect(brandingEnv({ brandingGoogleTag: 'G-ABC123XYZ' }).BRANDING_GOOGLE_TAG).toBe('G-ABC123XYZ')
    expect(brandingEnv({}).BRANDING_GOOGLE_TAG).toBe('')
  })

  it('emits exactly the keys BRANDING_ENV_KEYS names', () => {
    expect(Object.keys(brandingEnv({})).sort()).toEqual([...BRANDING_ENV_KEYS].sort())
  })
})

describe('the metadata vocabulary', () => {
  it('delivers the Google tag as a config key, and keeps the derived CSP list out of the stored lists', () => {
    expect(metadataConfigs).toContain('brandingGoogleTag')
    expect(metadataLists as string[]).not.toContain('cspSources')
  })
})
