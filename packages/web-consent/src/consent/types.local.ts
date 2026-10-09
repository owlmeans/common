import type { ConsentCategory, ConsentRecord } from '@owlmeans/consent'
import type { ConsentLink } from '../types.js'

export interface Translate { (key: string, defaultValue: string): string }

/** What the bar and the window both render below their text: the policy and the other links. */
export interface ConsentLinksProps {
  t: Translate
  policyHref?: string
  links?: ConsentLink[]
  className?: string
}

export interface ConsentBarProps extends ConsentLinksProps {
  categories: ConsentCategory[]
  /** Every domain the choice applies to — the cross-domain line renders with more than one. */
  domains: string[]
  barClassName?: string
  onPreferences: () => void
  onMandatory: () => void
  onAcceptAll: () => void
}

export interface ConsentWindowProps extends ConsentLinksProps {
  categories: ConsentCategory[]
  domains: string[]
  /** What is in force now — seeds the switches; an automatic decision is also said to be one. */
  record: ConsentRecord | null
  storageKey?: string
  /** The window was raised by something waiting on the answer — signing in. */
  gated: boolean
  className?: string
  onSave: (values: Record<string, boolean>) => void
}

export interface ConsentLocatingProps {
  t: Translate
}
