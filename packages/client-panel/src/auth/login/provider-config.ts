import type { LoginProviderConfig } from './types.js'

/**
 * `LoginScreenConfig.provider`, added by TypeScript module augmentation rather than by editing
 * `@owlmeans/config` itself.
 *
 * `@owlmeans/config` has roughly 85 dependents, and every one of them sits in the same release
 * closure — a config bump ripples through every package that pins a range against it, whether or
 * not it touches sign-in. The field below is read by exactly one consumer family (the sign-in
 * screen's headless model here and its renderers), so it is declared here instead, merged onto the
 * base interface by TypeScript's own declaration merging — the pattern
 * `@owlmeans/client-auth/login`'s `terms-config.ts` set.
 *
 * This file must be part of whatever a consumer's own compilation actually loads, or the merge
 * never happens — an ambient augmentation applies only once the compiler has read the file that
 * declares it. `@owlmeans/client-panel/auth`'s barrel re-exports this module for exactly that
 * reason, so ANY import from `@owlmeans/client-panel/auth` pulls this augmentation into that
 * program. An app that builds its `security.auth.login` literal in a file that imports nothing from
 * it (a config file importing only `@owlmeans/config`) still benefits as long as some other file in
 * the same `tsc` program does; if none does, add `import type {} from '@owlmeans/client-panel/auth'`
 * to the file building the literal — an import with an empty type list, kept only to pull this
 * file into that program's graph.
 *
 * `export {}` below is required, not decorative: without at least one top-level import/export this
 * file is a SCRIPT to TypeScript, not a MODULE, and `declare module '@owlmeans/config'` inside a
 * script augments the global scope instead of merging onto the named module's exports.
 */
declare module '@owlmeans/config' {
  interface LoginScreenConfig {
    /**
     * Who signs a person in on this application's behalf — an identity service the application
     * does not itself run. Absent, the screen discloses nothing and renders exactly as before.
     */
    provider?: LoginProviderConfig
  }
}

export { }
