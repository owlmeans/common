/**
 * Extra `LoginTermsConfig` fields, added by TypeScript module augmentation rather than by editing
 * `@owlmeans/config` itself.
 *
 * `@owlmeans/config` has roughly 85 dependents, and every one of them sits in the same release
 * closure — a config bump ripples through every package that pins a range against it, whether or
 * not it touches sign-in. The fields below are needed by exactly one consumer family (the sign-in
 * screen and its terms confirmation, all downstream of `@owlmeans/client-auth`), so they are
 * declared here instead, merged onto the base interface by TypeScript's own declaration merging.
 *
 * This file must be part of whatever a consumer's own compilation actually loads, or the merge
 * never happens — an ambient augmentation applies only once the compiler has read the file that
 * declares it. `@owlmeans/client-auth/login`'s barrel (`./index.ts`) re-exports this module for
 * exactly that reason, so ANY import from `@owlmeans/client-auth/login` — which every application
 * wiring sign-in already has — pulls this augmentation into that program. An app that constructs a
 * `LoginTermsConfig` literal in a file that imports NOTHING from `@owlmeans/client-auth/login`
 * still benefits as long as some other file in the same `tsc` program does; if none does (an
 * isolated leaf package that only ever imports `@owlmeans/config`), add
 * `import type {} from '@owlmeans/client-auth/login'` to the file building the literal — an
 * import with an empty type list, kept only to pull this file into that program's graph.
 *
 * `export {}` below is required, not decorative: without at least one top-level import/export this
 * file is a SCRIPT to TypeScript, not a MODULE, and `declare module '@owlmeans/config'` inside a
 * script augments the global scope instead of merging onto the named module's exports.
 */
declare module '@owlmeans/config' {
  interface LoginTermsConfig {
    /** `documents[].key` (or a custom document's own key) → the ISO date it was last revised. */
    revisions?: Record<string, string>
    /** Off by default. A bare string is `{ href }`. */
    billing?: string | { href: string, revisedAt?: string } | false
    /** Off by default. `name` is interpolated into the `login.terms.product` translation. */
    product?: { name: string, href: string, revisedAt?: string } | false
    /**
     * Custom documents beyond terms/billing/product, in the order they are agreed to.
     *
     * `label` may be a locale map (`{ en: '...', fr: '...' }`) — resolved at RENDER time, by
     * whichever renderer has the current locale, never here: this file stays locale-free.
     */
    documents?: Array<{
      key: string, href: string, label?: string | Record<string, string>, i18nKey?: string,
      revisedAt?: string,
    }>
    /** Show the latest revision date beneath the confirmation. Default false. */
    showRevision?: boolean
  }
}

export { }
