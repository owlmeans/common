import type { FC } from 'react'
import type { LoginMethodEmphasis } from '@owlmeans/config'
import type { LoginMethodContext } from '../../login/types.js'
import type { AuthenticationControl, AuthenticationRenderer, AuthenticationRendererProps, } from '../components/authentication/types.js'

export interface AuthenticationPlugin extends Pick<
  AuthenticationControl, "beforeAuthenticate" | "afterAuthenticate"
>, Pick<Partial<AuthenticationControl>, "authenticate"> {
  type: string
  Implementation: PluginImplemnetation
  Renderer?: AuthenticationRenderer
  /**
   * This plugin's `Implementation` cannot render without a `Renderer` a UI package supplies.
   *
   * It is declared rather than inferred because there is nothing to infer it from: a plugin that
   * renders its own form and one that throws `Renderer is not defined` are the same object until
   * the screen mounts. Declaring it is what lets the sign-in screen leave out a method whose
   * renderer nobody registered, instead of offering a button that crashes the page it opens.
   */
  requiresRenderer?: boolean
  /**
   * How this method presents itself on the sign-in screen.
   *
   * Absent means the plugin is never OFFERED — it is still reachable by type, which is what a
   * step-in-a-flow (re-captcha) and a plugin an app deep-links to both need. Every field is
   * optional so an existing plugin object keeps type-checking without being touched.
   */
  method?: AuthMethodMeta
}

export interface AuthMethodMeta {
  /** Defaults to the plugin's `type`. */
  id?: string
  /** Literal fallback used when no translation resolves. */
  label?: string
  /** Key under the `auth` library's `login.method.*`; defaults to the id. */
  i18nKey?: string
  /** Icon registry NAME, never markup — this package must stay free of an icon library. */
  icon?: string
  /** Ascending; default 100. */
  order?: number
  emphasis?: LoginMethodEmphasis
  /**
   * Never offered unless the configuration explicitly enables it.
   *
   * This is the secret-key gate: an operator login is registered like any other method and must
   * not become offerable merely by being registered.
   */
  restricted?: boolean
  /** Registered, but never a choice. */
  hidden?: boolean
  /**
   * Whether the application this method is about to be offered in actually wired it.
   *
   * The plugin registry is global and is written to by side-effect imports, so being registered
   * says only that some bundle pulled the module in — and modules arrive in groups. An app that
   * wanted one method out of a package gets every method that package registers, including ones
   * whose first act is to look up a service its context never appended. This is where a plugin
   * says so, per context, at render time; `false` leaves it off the screen.
   *
   * Absent means "always", which is right for a plugin that needs nothing but itself.
   */
  available?: (ctx: LoginMethodContext) => boolean
}

export interface PluginImplemnetation {
  (Renderer?: AuthenticationRenderer): FC<AuthenticationRendererProps>
}
