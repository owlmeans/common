---
name: web-auth-token
description: How to use @owlmeans/web-auth-token — the browser half of long-lived access tokens (API keys) — the AccessTokensPanel, the useAccessTokens hook, the alias override, the mandatory Tailwind @source line, the i18n override and the data-testid contract. Auto-invoked when building a token/API-key management screen, importing the panel or the hook, or changing what the panel renders.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-auth-token

**Layer:** Web (React, shadcn + Tailwind v4)
**Install:** `"@owlmeans/web-auth-token": "^0.1.18-rc.6"` in `dependencies`
**Contracts:** `@owlmeans/auth-token` — records, `CreateAccessToken`, `authToken` aliases,
`makeAuthTokenEntrypoints`

## Key Exports

| Export | Description |
|--------|-------------|
| `ConnectedAccessTokensPanel` | The whole feature — the panel wired to `useAccessTokens`. Props: `aliases?`, `usageHint?` |
| `AccessTokensPanel` | The same panel, presentational. Props: `items`, `issued`, `loading?`, `error?`, `onCreate`, `onRevoke`, `onDismissIssued`, `usageHint?` |
| `useAccessTokens(aliases?)` | The I/O half — `{ items, issued, loading, error, reload, create, revoke, dismissIssued }` |
| `tokenStatus(item)` | `'active' \| 'expired' \| 'revoked'` — revocation outranks expiry |
| `formatMoment(value, lng?)` | A record's moment in the reader's language, or `null` when there is none |
| `cn(...inputs)` | The class-name merger the components are written against — an app never re-declares it |
| `AUTH_TOKEN_I18N` | `'auth-token'` — the library-tier i18n resource |
| `TOKEN_EXPIRY_CHOICES` / `TOKEN_EXPIRY_NEVER` / `DAY_SECONDS` | The lifetimes the create form offers, in days, plus the seconds conversion |
| `AccessTokensAliases` | `{ list, create, revoke }` — where the three routes are mounted |

## The panel is presentational; the hook owns the I/O

`AccessTokensPanel` performs **no** I/O. It renders what it is handed and reports what the user
pressed — which is what lets an application mount it against a manager facade that proxies the
token routes, or against a fixture in a harness. Everything that talks to a server lives in
`useAccessTokens`, and `ConnectedAccessTokensPanel` is the two joined.

Two rules keep that split honest:

- **Nothing thrown escapes the hook.** Every call captures its failure into `error`
  (`ResilientError.ensure`) instead of throwing. A panel that cannot list its tokens must still
  render, with the failure on it — an error boundary swallowing the screen leaves a user who cannot
  see that revoking is still possible.
- **The issued plaintext is state, not a return value.** `create` stores the `IssuedAccessToken`
  so the panel can show it once; `dismissIssued` clears it. It is never persisted — a page reload
  is the same as pressing Done, and that is what makes showing it safe. While `issued` is set the
  dialog is **forced open**, because that copy exists nowhere else.

## Wiring

```tsx
import { makeAuthTokenEntrypoints } from '@owlmeans/auth-token'
import { ConnectedAccessTokensPanel } from '@owlmeans/web-auth-token'

context.registerEntrypoints(makeAuthTokenEntrypoints({ parent: account.base }))

<ConnectedAccessTokensPanel usageHint={t('tokens.usage')} />
```

The hook addresses `authToken.list` / `.create` / `.revoke` by default. An application that mounted
the same routes under its own aliases passes `aliases` — that is the only supported way to retarget
it; never fork the component to change an alias.

`CreateAccessToken.expiresIn` is **seconds**, while `TOKEN_EXPIRY_CHOICES` is **days**: the form
multiplies by `DAY_SECONDS`, and the `never` choice omits the field entirely rather than sending a
zero.

## The `@source` line — a consumer rule, not a detail

Tailwind's scanner reads the CSS root plus `@source` directives and excludes `node_modules`, so a
class used only inside this package never reaches the app's stylesheet and the panel renders
unstyled with nothing in the app's own sources to blame. Every consuming app adds:

```css
@source "../../../node_modules/@owlmeans/web-auth-token/src";
```

Point at the shipped `src`, not `build`, so the scanner sees source in both an installed tarball and
a linked workspace.

The package owns its private shadcn primitives under `src/@/` and imports them only through
relative specifiers; the consuming application's `@` alias is never part of this package's runtime.
Do not vendor `alert`, `badge`, `button`, `card`, `dialog`, `input`, `label`, `select` or `table`.
Provide the documented Radix peers instead: `@radix-ui/react-dialog`, `@radix-ui/react-label`,
`@radix-ui/react-select` and `@radix-ui/react-slot`.

## Translations

Every string is registered at the library tier as `lib : auth-token.panel.*`, in all seven
`SUPPORTED_LNGS`, by the `src/i18n.ts` side effect the barrel re-exports. Components resolve them
with `useI18nLib(AUTH_TOKEN_I18N, 'panel')`; there is no English literal in the JSX, and a new
string is added to all seven files in the same change.

An application overrides any of them at the app tier — and must **name the namespace**, because
`addI18nApp` defaults it to the resource name while the library's bundle sits in `lib`:

```ts
addI18nApp('en', 'auth-token', { panel: { title: 'API keys' } }, { ns: LIB_NAMESPACE })
```

Drop `{ ns: LIB_NAMESPACE }` and nothing errors — the override simply never renders.

## The `data-testid` contract

These names are the API an application's e2e suite is written against. Renaming one is a breaking
change to every suite that used it.

| Testid | Element |
|---|---|
| `account-token-create` | Opens the create dialog |
| `account-token-row` | One token row; also carries `data-token-id={item.id}` |
| `account-token-revoke` | The row's revoke button (disabled once revoked) |
| `account-token-name` | The name input in the create dialog |
| `account-token-submit` | Submits the create form |
| `account-token-value` | The read-only input holding the plaintext, shown once |
| `account-token-copy` | Copies that plaintext to the clipboard |

A refused or missing clipboard (an insecure origin, a denied permission) is not an error the panel
reports: the value is on screen and selectable, and the button simply does not claim a copy it did
not make.

## Cross-references

- `[[shadcn-web]]` — the `@` contract, the package skeleton, how a primitive is vendored
- `[[localization]]` — the tiered namespace model and the seven-language rule
- `[[web-panel]]` — the reference shadcn package this one is shaped after
- `[[auth-protocol]]` — where long-lived tokens sit among the other authentication paths
