import type { ConsentService } from '@owlmeans/consent'

export interface Translate { (key: string, defaultValue: string): string }

export interface ServiceListProps {
  services: ConsentService[]
  /** The category's own label, already resolved — it names the list for assistive technology. */
  label: string
  /** The category key, for tests and CSS; absent for the trailing group of unmatched services. */
  category?: string
  t: Translate
}
