import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Class-name merge, owned by this package rather than reached through the `@` alias contract.
 *
 * The `@` contract exists so a consumer's own THEME and shadcn primitives win over a package's
 * copies. `cn` has neither in it — it is four lines of string merging — and requiring an alias for
 * it would mean every consumer of a consent dialog must first adopt an OwlMeans UI contract. One
 * of the sites that needs this dialog most is an Astro site with its own component library and no
 * such alias, so the dialog would simply fail to build there.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
