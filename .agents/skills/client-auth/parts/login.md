---
name: login
description: The ./login host — method registry, post-login landing, the terms confirmation, surrogate windows, token adoption, and the useLogin/useLogout hooks.
metadata:
  purposes: auth, consent
  mentions: useLogin, @owlmeans/client-auth/login, useLogout, appendLogin, loginTermsHelper, loginLandingOf, loginTokenOf, loginStartOf, loginMethodsHelper, LoginStep, LoginPlugin, FallbackLoginScreen
---

# @owlmeans/client-auth — The login-plugin host

## `./login` — the login-plugin host

An `AuthenticationPlugin` answers how a credential is proven; a `LoginPlugin` answers in which
browsing context the round trip can complete at all.

| Export | Description |
|--------|-------------|
| `appendLogin(ctx)` | Register the host and expose it as `context.login()` |
| `makeLoginService(alias?)`, `ensureLoginService(ctx)` | The host itself — a **lazy** service, so `makeContext` can reach it at the Loading stage — and the idempotent getter a plugin package calls before `registerPlugin` |
| `LoginPlugin`, `LoginEnv`, `LoginRequest`, `LogoutRequest`, `LoginOutcome`, `LoginIntent`, `LoginService`, `LoginContext`, `LoginPrecondition` | The contract |
| `loginMethodsHelper` → `.registerMethodSource`, `.listMethodSources`, `.resolveLoginMethods`, `.primaryLoginMethod` | Which sign-in methods are offered — see `login-methods` |
| `LoginMethod`, `LoginMethodSource`, `LoginMethodContext` | Method types |
| `loginLandingOf(ctx)` → `.landAfterLogin(opts?)`, `.continueLogin(opts?)`, `.landingUrl(landing)`; `useContinueLogin()` | The post-login landing decision (`src/login/land.ts`) — see `login-plugins`. `landAfterLogin` runs due landing hooks then delegates to `continueLogin`, which walks pending `LoginStep`s, then `flowLandingOf(ctx).resumeSuspendedFlow`, then `LandOptions.fallback ?? { alias: HOME }`; `landingUrl` builds the absolute URL a plugin's own `window.location.href` needs; `useContinueLogin()` is what a step's own screen calls once satisfied |
| `LoginStep`, `LoginLanding`, `LoginLandingHook`, `LandOptions`, `LoginLandingParams` | Landing-seam types. `registerStep`/`steps`/`onLanded`/`landingHooks` on `LoginService` are the same replace-by-alias, priority-sorted registries as `registerPlugin`. `LoginStep` also carries `confirmsTerms?: boolean` (this step is where the Terms confirmation lives — see `loginTermsHelper.termsDeferred` below) and `required?: boolean` (a throw/timeout in `pending` reads as PENDING, not "not pending" — see `login-plugins`) |
| `LOGIN_STEP_TIMEOUT`, `LOGIN_LANDED_STORAGE` | A step's `pending`/a hook's `landed` is bounded by the former; the latter is where the last-landed token is recorded (the raw string, never a digest) |
| `loginTermsHelper` → `.resolveTerms`, `.termsAccepted`, `.acceptTerms`, `.termsSentence`, `ResolvedTerms`, `ResolvedTermsDocument`, `TermsSentencePart` | The confirmation. `resolveTerms` produces `documents` (what the checkbox agrees to: terms, then billing/product/custom when configured) and `notices` (what is only disclosed: privacy, plus cookies per its own inclusion rule) — see the terms-confirmation section of `login-methods`. The extra `LoginTermsConfig` fields (`billing`, `product`, `documents`, `revisions`, `showRevision`, `localizedHrefs`) are added by module augmentation in `src/login/terms-config.ts`, never by editing `@owlmeans/config` — importing anything from `@owlmeans/client-auth/login` pulls it in |
| `loginTermsHelper.termsLabelResolver(translate, locale)`, `loginTermsHelper.termsAcceptanceOf(resolved, locale?)`, `TermsAcceptanceRef` | The ONE document-label resolver and ONE wire-shape builder every terms renderer/recorder shares (`FallbackLoginScreen`, `web-panel`'s `LoginTerms`, `web-marketing-consent`'s Terms box and `termsRecorder`) — no more hand-kept duplicate `DEFAULT_LABEL`/`resolveLabelFor` per package. `termsAcceptanceOf` keeps only `{key, href, revisedAt}` per document — structurally `@owlmeans/marketing-consent`'s `TermsAcceptance`, with no dependency on that package |
| `loginTermsHelper.termsDeferred(ctx)` | True once a registered AND BOUND `LoginStep` declares `confirmsTerms` — see the "Deferring the confirmation" section of `login-methods`. Reads `ctx.hasService`/`.hasEntrypoint` directly, never `ensureLoginService` (which has the side effect of registering an empty host) |
| `resolveCredit`, `ResolvedCredit` | The credit and copyright line |
| `FallbackLoginScreen`, `LoginScreenProps` (now also carries `locale?: string`, for `Intl.ListFormat` and a custom document's locale-keyed label), `LoginScreenComponent` | The plain sign-in screen a relying party renders when no UI family registered one |
| `surrogatePath(ctx, target)`, `SurrogateTarget` | Where a surrogate login window opens; `null` on an older entrypoint list |
| `loginResumeHelper.resumeAction(outcome)`, `ResumeAction`, `loginResumeHelper.loginAttemptError(outcome)` | The one reading of a `resume` outcome, and the one reading of a finished attempt |
| `registerNotifier(notifier)` (on `LoginService`), `LoginNotifier` | Surfaces a `begin`/`logout` outcome that has no inline screen to render it on — e.g. a toast on `LoginOutcome.Blocked` for a header "Log in"/"Log out" control. `web-panel`'s `appendLoginScreen` registers a default; unregistered, it is silence |
| `enterOidcAuthorization(model)` | Move a flow to the step that can authorize — idempotent, call it before every `authenticate` |
| `loginTokenOf(ctx).adoptToken(token)`, `.revokeToken()` | The single adoption and de-adoption paths |
| `useLogin(target?)`, `useLogout(target?)` | Wiring for a sign-in / sign-out control. `useLogin`'s `target` is the screen to land on AFTER sign-in (parked, never navigated to first); `useLogout`'s is where the document goes once the session is gone |
| `loginStartOf(ctx).startLogin({ url, target?, go })`, `LoginStart` | The React-free decision behind `useLogin` (`src/login/start.ts`): a target with a session already held goes straight there; otherwise `begin` with the target and a continuation to `DISPATCHER` |
| `loginEnvHelper` → `.isEmbedded`, `.isSurrogate`, `.markSurrogate`, `.clearSurrogate`, `.defaultLoginEnv` | Environment probes the host builds `LoginEnv` from |
| `LOGIN_SERVICE`, `LOGIN_SURROGATE_NAME`, `LOGIN_TOKEN_MESSAGE`, `LOGIN_LOGOUT_MESSAGE`, `LOGIN_SURROGATE_MARKER`, `LOGIN_SURROGATE_WIDTH`, `LOGIN_SURROGATE_HEIGHT`, `LOGIN_WATCH_INTERVAL`, `LOGIN_INTENT_QUERY`, `LOGIN_NEXT_QUERY`, `LOGIN_METHOD_QUERY`, `LOGIN_TERMS_STORAGE`, `LOGIN_TARGET_TTL`, `DEFAULT_LOGIN_PRIORITY`, `DEFAULT_METHOD_ORDER` | Aliases and the fixed cross-document wire values. `LOGIN_SURROGATE_FEATURES` also still exports (deprecated, never centered) — `@owlmeans/web-client`'s `centeredPopupFeatures(LOGIN_SURROGATE_WIDTH, LOGIN_SURROGATE_HEIGHT)` is what the surrogate plugin actually opens the window with |

```typescript
import { useLogin, useLogout } from '@owlmeans/client-auth/login'

const [loginPath, onLogIn] = useLogin()
const onLogOut = useLogout()
```

Both handlers are deliberately **not** async and await nothing before delegating — a window opened
after the user gesture has finished being handled is eaten by the popup blocker. Each resolves its
entrypoint **inside** the hook, never at module scope — `DISPATCHER` for `useLogin`, the surrogate
path for `useLogout`. A module body runs before `registerEntrypoints`, so `useLogin`'s lookup at
top level throws `Entrypoint dispatcher not found` during import, taking the whole render down.

`useLogin(target)` signs in FIRST and lands on `target` after, in an ordinary tab (redirect plugin)
and in a framed application (surrogate popup) alike, with every pending post-sign-in step run on the
way. Its `navigate` continuation is ALWAYS `DISPATCHER` — never the target, because a guarded screen
reached before sign-in renders signed out. The target travels as `LoginRequest.target`: the facade's
`begin`, past the preconditions, parks it with `flowLandingOf(ctx).suspendLanding`
(`@owlmeans/client-flow`, the `RESUME_FLOW` record its `resumeSuspendedFlow` reads, expiring after
`LOGIN_TARGET_TTL`) — the write is started, never awaited before the plugin, so a popup still opens
inside the gesture — and holds the continuation until the write has landed. The dispatcher's
`landAfterLogin` (landing hooks → pending steps such as a consent screen → the parked target) then
ends on it. An attempt that signs nobody in (`Blocked`, `Failed`, `Gesture`) discards the parked
target; a refused precondition never parks it. A session already held (the auth service's in-memory
`token`) goes straight to the target. Without a target, `useLogin()` is the plain sign-in to the
ordinary landing. A caller of `login().begin` that passes a `target` without a `navigate` leaves the
document at once, so its parked target is best-effort.

`useLogout` sends a continuation only when a target is given. Omitting it does not leave the session
behind: the token is revoked either way, and the plugin decides what the document does with no
continuation to run — `@owlmeans/web-client`'s redirect plugin reloads the page, because cached auth
reads only forget a session when the application is rebuilt. `useLogin` returns `[path, handler]`
(the path is the dispatcher's, with or without a target) and `useLogout` a bare handler — a logout
control has no address to point at.

Plugin selection, the shipped browser flows and the full invariant list: the `login-plugins` skill.
