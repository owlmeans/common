---
name: manager
description: The ./manager authentication screen, control and plugin registry, and the ./manager/plugins contract an authentication-plugin package writes against.
metadata:
  purposes: auth
  mentions: AuthenticationPlugin, @owlmeans/client-auth/manager, @owlmeans/client-auth/manager/plugins, AuthenticationHOC, AuthenticationRenderer, makeControl, authPluginHelper, registerAuthPlugin, pluginMethodSource, createWalletFacade, TunnelConsumer
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-auth — The authentication screen and plugin contract

## `./manager` — the authentication screen and the registry

| Export | Description |
|--------|-------------|
| `plugins`, `authPluginHelper` → `.registerAuthPlugin`, `.getAuthPlugin`, `.listAuthPlugins` | The module-global registry |
| `AuthenticationHOC`, `AuthenticationProps`, `TAuthenticationHOC` | The screen that hosts a plugin's implementation |
| `makeControl`, `AuthenticationControl`, `AuthenticationControlState` | The control a plugin drives: `requestAllowence`, `authenticate`, and the state it persists across a provider redirect |
| `AuthenticationRenderer`, `AuthenticationRendererProps`, `ClientAuthType`, `ClientAuthenticationMethod`, `AuthenticationCallback` | Rendering contract |
| `TunnelConsumer`, `TunnelAuthenticationProps`, `TunnelAuthCallback` | The wallet-tunnel consumer screen |
| `AuthenCredError` | Thrown when the entered credential cannot be used |

## `./manager/plugins` — the authentication-plugin contract

| Export | Description |
|--------|-------------|
| `AuthenticationPlugin` | `type`, `Implementation`, optional `Renderer`, `requiresRenderer?`, `method?` and the `authenticate` / `beforeAuthenticate` / `afterAuthenticate` hooks |
| `PluginImplemnetation` (sic) | `(Renderer?) => FC<AuthenticationRendererProps>` — the shape of `Implementation` |
| `AuthMethodMeta` | How the plugin presents itself as a sign-in method — see `login-methods` |
| `plugins`, `authPluginHelper` | The same registry as `./manager` |
| `pluginMethodSource` | The `LoginMethodSource` that turns registered plugins into offerable methods |
| `createWalletFacade`, `PinSchema`, `PinForm`, `TunnelAuthenticationRenderer`, `TunnelAuthenticationRendererProps` | Wallet-tunnel helpers a consumer plugin builds on |
| `ed25519BasicUIPlugin`, `reCaptchaPlugin`, `tunnelConsumerUIPlugin` | The shipped plugin objects |

Shipped plugins register themselves by side effect: `basic-ed25519`, `re-captcha` and
`wallet-consumer` when `@owlmeans/client-auth/manager` is imported, OIDC and Google from
`@owlmeans/web-oidc-rp/auth/plugins`, the PK supervisor from `@owlmeans/web-auth`.
