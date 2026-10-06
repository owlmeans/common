/** The two paths a context's authentication changes by: a token adopted, a token dropped. */
export interface LoginTokenHelper {
  /**
   * The one path an issued bearer token becomes this context's authentication.
   *
   * Resolved by alias rather than through `ctx.auth()` so the login host does not require
   * `AuthServiceAppend` on the context it is given — a plugin can adopt a token on any context that
   * carries the auth service, including one it did not build.
   *
   * Going through `AuthService.update` matters: it stores the record, decodes the envelope and sets
   * both `auth` and `token` in one place. Writing those three by hand — which is what the popup and
   * the MUI relying party each used to do — leaves the same state on a good day and diverges the
   * moment any of it changes.
   */
  adoptToken: (token: string) => Promise<void>
  /**
   * The one path this context's authentication is dropped, and the exact mirror of {@link adoptToken}.
   *
   * `undefined`, not `null`: `undefined` is the declared clearing value, and on the web the auth
   * service reacts to it by navigating to the dispatcher. Everything that signs a user out goes
   * through here — the hook, both browser plugins and the surrogate screen — so there is one place
   * where "signed out" is defined rather than four that agree until one of them changes.
   */
  revokeToken: () => Promise<void>
}
