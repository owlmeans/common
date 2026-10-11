# @owlmeans/cli-auth

Browser sign-in for a command-line tool or a stdio MCP server, over the OAuth 2.1 device
authorization grant. It provides a dotenv-style `~/.owlmeans` credentials file (overridable, the
environment always wins), atomic `0600` writes, a cross-process sign-in lock so several invocations
converge on one browser round trip, a best-effort browser opener, and `makeCliCredentials` — a small
credential holder a CLI wraps its API calls with. It is a generic public utility for Node/Bun: no
React, no DOM, no OwlMeans context. Its current consumer is the closed-source `@owlmeans/viable-mcp`
connector, built outside this repository. A browser app signs in through `@owlmeans/client-auth`
instead; the protocol calls themselves (discovery, device authorization, polling, revoke) live in
`@owlmeans/oauth`, and the server side is any API built on `@owlmeans/server-oauth`.

## Installation

```bash
bun add @owlmeans/cli-auth@^0.1.18-rc.17
```

## Concepts

- **Credentials file** — `KEY=VALUE` lines at `OWLMEANS_CREDENTIALS`, else `~/.owlmeans`. One file
  per deployment; files are never merged.
- **Precedence** — the process environment wins over the file, but an environment value that is the
  empty string counts as unset.
- **Bound token** — a file token belongs to the API URL recorded under `apiUrlEnvKey`. A file naming
  a different URL yields no token; a file naming none belongs to whatever URL is asked for.
- **Holder** — `makeCliCredentials(opts)` → `token()`, `require(waitMs?)`, `invalidate(rejected)`,
  `signOut()`.
- **Single flight** — one device sign-in per API URL per process (module-level map), and across
  processes a `<credentials file>.lock` that a second process joins instead of opening a second
  browser tab. The lock is best-effort, not mutual exclusion.
- **Background sign-in** — when `require()` gives up waiting it throws `SignInRequired`; polling
  continues and the next `require()` joins it.

## Usage

### Wrap API calls with the holder

```typescript
import { makeCliCredentials } from '@owlmeans/cli-auth'

const credentials = makeCliCredentials({
  apiUrl: 'https://api.example.com',
  clientId: 'https://example.com/oauth/cli.json',   // a static client id or a CIMD URL
  tokenEnvKey: 'EXAMPLE_API_TOKEN',
  apiUrlEnvKey: 'EXAMPLE_API_URL',
  onNotify: message => process.stderr.write(`${message}\n`),
})

const token = await credentials.require()   // starts or joins a device sign-in when needed

const res = await fetch(`${apiUrl}/projects`, { headers: { Authorization: `Bearer ${token}` } })
if (res.status === 401) {
  await credentials.invalidate(token)   // forget a file token; throw TokenRejected for an env token
}

await credentials.signOut()   // revoke at the server (best effort) and clear the file token
```

`require()` throws `SignInRequired` (from `@owlmeans/oauth`, carrying `url`, `code`, `expiresAt`)
when nobody approves within `waitMs` (default 20 s), `OAuthAccessDenied` when the person denies, and
`OAuthError` when the authorization expires or is aborted.

### Present the token to OwlMeans routes

The holder's `token()` fits the thunk form of the `@owlmeans/auth-token` carrier guard, with
`invalidate` wired to the guard's `onRejected`.

```typescript
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { makeTokenCarrierGuard } from '@owlmeans/auth-token'

let current = ''
context.registerService(makeTokenCarrierGuard(DEFAULT_GUARD, {
  token: async () => (current = await credentials.require()),
  scheme: 'bearer',
  onRejected: async () => { await credentials.invalidate(current) },
}))
```

### Read and write the credentials file directly

```typescript
import { envFileHelper } from '@owlmeans/cli-auth'

const path = envFileHelper.resolveEnvFile()
const values = await envFileHelper.loadOwlmeansEnv()   // file overlaid by non-empty env values

const { insecurePermissions } = await envFileHelper.setEnvValues(path, {
  EXAMPLE_API_URL: 'https://api.example.com',
  EXAMPLE_API_TOKEN: undefined,   // undefined removes the key
})
if (insecurePermissions) {
  console.warn(`${path} is readable by other users`)
}
```

### Open a browser

```typescript
import { openBrowser } from '@owlmeans/cli-auth'

if (!openBrowser(verificationUri)) {
  console.error(`Open ${verificationUri} in a browser`)
}
```

## API

### Functions and helpers

| Symbol | Kind | Purpose |
|---|---|---|
| `makeCliCredentials(opts)` | function | the credential holder (`CliCredentials`) |
| `envFileHelper`, `createEnvFileHelper()` | helper | `resolveEnvFile`, `parseEnv`, `readCredentialsFile`, `loadOwlmeansEnv`, `setEnvValues` |
| `openBrowser(url, env?)` | function | detached `open` / `xdg-open` / `cmd /c start` with ignored stdio; `false` on any refusal |
| `lockPathFor(credentialsPath)` | function | `<credentialsPath>.lock` |
| `makeSignInLockHelper(path)` | function | `readLock`, `claimOrJoinLock(apiUrl, draft)`, `releaseLock(nonce)` |
| `loadOwlmeansEnv(env?)` | deprecated function | `compat:factory-refactor` wrapper — use `envFileHelper.loadOwlmeansEnv` |

### `CliCredentialsOptions`

| Field | Purpose |
|---|---|
| `apiUrl` | the API origin; also the OAuth `resource` unless `resource` is set |
| `clientId` | the CLI's OAuth `client_id` — static, or a Client ID Metadata Document URL |
| `tokenEnvKey`, `apiUrlEnvKey` | key names for the token and its bound URL, in the file and the environment |
| `deviceName?` | defaults to `<hostname> · <user>` |
| `resource?`, `scope?` | OAuth request parameters |
| `env?` | defaults to `process.env` |
| `onNotify?` | progress messages ("Sign in at … with code …", "Signed in.") |

### Constants

| Symbol | Value |
|---|---|
| `ENV_CREDENTIALS_FILE` | `'OWLMEANS_CREDENTIALS'` |
| `DEFAULT_CREDENTIALS_FILENAME` | `'.owlmeans'` |
| `DEFAULT_WAIT_MS` | `20_000` — `require()` wait before `SignInRequired` |
| `MAX_SIGN_IN_WAIT_MS` | 15 minutes — the poller's own ceiling |

### Types

`CliCredentials`, `CliCredentialsOptions`, `SignInLockInfo`, `SignInLockDraft`, `SignInLockClaim`,
`SignInLockHelper`, `EnvFileHelper`, `SetEnvValuesResult`.

## Browser suppression

`openBrowser` returns `false` without spawning when `OWLMEANS_NO_BROWSER=1` or `BROWSER=none`, on
Linux with neither `DISPLAY` nor `WAYLAND_DISPLAY`, and on an unknown platform. The printed
"Sign in at … with code …" line is the real interface; the browser is a convenience. Only the lock
owner opens a browser.

## Common pitfalls

- Never read the token from argv or write it into a harness or config file; it lives in the
  environment or the credentials file.
- An environment token that the server rejects is reported (`TokenRejected`), never silently
  replaced by a new sign-in.
- A token stored for one API URL is not sent to another; point `OWLMEANS_CREDENTIALS` at a separate
  file per deployment.
- Loose permissions on an existing file are reported, not tightened.
- In tests, point `OWLMEANS_CREDENTIALS` at a temp path, use a distinct `apiUrl` per test (the
  in-flight map is module-level), and set `OWLMEANS_NO_BROWSER=1`.
- Any timer added around `require()` must be cleared; a pending timer keeps the process alive after
  sign-in.

The `cli-auth` skill covers file precedence, the holder's single-flight rules, the lock and test
isolation; the `oauth` skill covers the device grant itself.

## Related packages

- [`@owlmeans/oauth`](../oauth) — discovery, device authorization, polling, revoke and `SignInRequired`
- [`@owlmeans/server-oauth`](../server-oauth) — the authorization server a CLI signs in against
- [`@owlmeans/auth-token`](../auth-token) — the carrier guard that presents the resulting token
- [`@owlmeans/error`](../error) — `ResilientError`, the base of the thrown OAuth errors

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
