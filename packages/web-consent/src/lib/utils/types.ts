import type { ClassValue } from 'clsx'
import type { ConsentLinkerOptions } from '@owlmeans/consent'

/** What the dialog and the policy page share: class merging and the disclosed domains. */
export interface WebConsentUtils {
  /**
   * Class-name merge, owned by this package rather than reached through the `@` alias contract.
   *
   * The `@` contract exists so a consumer's own THEME and shadcn primitives win over a package's
   * copies. `cn` has neither in it — it is four lines of string merging — and requiring an alias for
   * it would mean every consumer of a consent dialog must first adopt an OwlMeans UI contract. One
   * of the sites that needs this dialog most is an Astro site with its own component library and no
   * such alias, so the dialog would simply fail to build there.
   */
  cn: (...inputs: ClassValue[]) => string
  /**
   * The domains one document's choice is disclosed as applying to: this host plus every domain
   * `linker` names, deduplicated, current host first.
   *
   * Computed directly from `linker.domains` rather than through `@owlmeans/consent`'s
   * `consentDomains()` registry helper: `CookieConsent` and `CookiePolicy` already have the
   * configuration in hand as a prop, and a component that reads it straight has no reason to depend
   * on whether `consentLinker` has finished registering itself yet (`consentStore.init` runs that
   * registration from an effect, a render tick after mount). `consentDomains()` stays the right call
   * for a caller that does NOT have `linker` in hand.
   */
  disclosedDomains: (linker: ConsentLinkerOptions | undefined) => string[]
}
