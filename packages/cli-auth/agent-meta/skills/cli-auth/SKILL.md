---
name: cli-auth
description: How to use @owlmeans/cli-auth — Node-side browser sign-in for a command-line tool or stdio MCP server: the `~/.owlmeans` dotenv credentials file and its precedence, atomic 0600 writes, the browser opener and its suppression, the cross-process sign-in lock, and makeCliCredentials (token/require/invalidate/signOut) that runs the device grant. Auto-invoked when adding sign-in to a CLI, reading or writing the credentials file, diagnosing "signed in but the token is ignored", or writing tests that must not touch the developer's real credentials.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/cli-auth

**Layer:** Tooling (Node/Bun — no React, no DOM, no framework runtime)
**Install:** `"@owlmeans/cli-auth": "^0.1.18-rc.9"` in `dependencies`
**Contracts:** `@owlmeans/oauth` (discovery, device authorization, polling, revoke, `SignInRequired`)
**Server half:** any API built on `@owlmeans/server-oauth`; **consumers:** `@owlmeans/viable-mcp`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeCliCredentials(opts)` | The holder: `token()` · `require(waitMs?)` · `invalidate(rejected)` · `signOut()` |
| `resolveEnvFile(env?)` | `OWLMEANS_CREDENTIALS`, else `~/.owlmeans` |
| `parseEnv(content)` | `KEY=value`, optional `export `, `#` comments, one level of quotes |
| `readCredentialsFile(env?)` | The file's values alone — what a token is *bound* to |
| `loadOwlmeansEnv(env?)` | File overlaid by the process environment (below) |
| `setEnvValues(path, values)` | Replace named keys, keep every other line; atomic, `0600`; returns `{ insecurePermissions }` |
| `openBrowser(url, env?)` | Best-effort detached opener; `false` on any refusal |
| `claimOrJoinLock` · `readLock` · `releaseLock` · `lockPathFor` · `SignInLockInfo` | The sign-in lock |
| `ENV_CREDENTIALS_FILE` · `DEFAULT_CREDENTIALS_FILENAME` · `DEFAULT_WAIT_MS` (20 s) · `MAX_SIGN_IN_WAIT_MS` (15 min) | Constants |

`CliCredentialsOptions`: `apiUrl`, `clientId` (a static client the server declared, or a CIMD URL),
`tokenEnvKey`, `apiUrlEnvKey` (both required — the package is not tied to one product's key
names), `deviceName?` (defaults to `host · user`), `resource?` (defaults to `apiUrl`), `scope?`,
`env?` (defaults to `process.env`), `onNotify?`.

## The credentials file

Dotenv-style `KEY=VALUE`, e.g. `VIABLE_API_URL=…` and `VIABLE_API_TOKEN=…`. Never merged with another
file; a CLI that serves several deployments points `OWLMEANS_CREDENTIALS` at one file each.

- **The environment wins over the file** (`loadOwlmeansEnv` → `{ ...file, ...envWithoutEmpty }`).
- **An empty environment value counts as unset.** A harness config that expands an unset variable
  (`${VIABLE_API_TOKEN:-}`) produces `''`, which must not shadow the file — "I did not set it" and
  "set it to nothing" are not the same, and the file is the more deliberate of the two.
- **A token belongs to the file's API URL.** `token()` refuses a file token when the file names a
  different `apiUrlEnvKey` value than the one asked for; a file that names none belongs to whichever
  URL is asked for. A token is never sent to another API.
- **Writes are atomic and private:** temp file in the same directory, `rename`, mode `0600`, other
  lines and comments preserved. Loose permissions on an existing file are *reported*
  (`insecurePermissions`), not silently tightened — someone may have set them on purpose.
- The token is never read from argv, never written to a harness/config file.

## The holder

- **`token()`** — the environment value, else the bound file value, else `null`.
- **`require(waitMs = DEFAULT_WAIT_MS)`** — returns a token, starting or joining ONE device sign-in
  per API URL: discover → `requestDeviceAuthorization` → claim/join the lock → `notify("Sign in at
  <url> with code <code>")` → open the browser (owner only) → `pollDeviceToken` → persist
  `{tokenEnvKey, apiUrlEnvKey}` → resolve. If `waitMs` runs out first it throws `signInRequired`
  (`url`, `code`, `expiresAt` from the lock) and **polling continues in the background**; the next
  `require()` joins it instead of starting over. `denied`/`expired`/`aborted` become
  `OAuthAccessDenied` / `OAuthError`.
- **The `waitMs` ceiling is a timer that is cleared** when the race is decided. A pending timer keeps
  a Node process alive, so an uncleared one made `viable-mcp login` (ceiling 15 minutes) hang after
  it had signed in. Any new timeout in this package clears its timer the same way.
- **Single-flight in-process:** `beginOrJoin` is synchronous up to the module-level
  `inFlightByApiUrl` map insert, so two racing `require()` calls converge. An `await` before that
  insert reopens the race (a `Promise<Promise<…>>` there once made `require()` hang forever).
- **Single-flight across processes:** `<credentials file>.lock` (mode `0600`) records `pid`,
  `apiUrl`, `verificationUri`, `userCode`, `deviceCode`, `interval`, `expiresAt` and a `nonce`. A live
  lock for the same URL (unexpired, pid alive) makes a second process a **joiner** — it shows the same
  code, does not open a second tab, and polls the same authorization. `releaseLock` deletes only a
  lock carrying the caller's own `nonce`. Best effort, not mutual exclusion: two processes racing the
  same instant may each drive a sign-in, costing a tab, never a corrupt file.
- **`invalidate(rejected)`** — call on a 401. A file token that is still the rejected one is removed
  (next `require()` signs in); an **environment** token is never silently replaced — it throws
  `TokenRejected(tokenEnvKey)` so the operator hears "VIABLE_API_TOKEN was refused" instead of the
  tool quietly becoming another identity.
- **`signOut()`** — best-effort `revokeToken` at the server, then remove the file token.

## Opening the browser

`openBrowser` spawns `open` / `xdg-open` / `cmd /c start` **detached with `stdio: 'ignore'`**, because
stdout may carry a protocol (an MCP server's JSON-RPC) that nothing the opened program writes may
reach. It refuses (returns `false`) when `OWLMEANS_NO_BROWSER=1` or `BROWSER=none`, and on Linux
with neither `DISPLAY` nor `WAYLAND_DISPLAY`. Automation and end-to-end runs set
`OWLMEANS_NO_BROWSER=1` and open the printed URL themselves. A failed open is never fatal — the
"sign in at … with code …" line is the real interface and works over SSH and in containers.

## Testing

Category A: `bun test ./tests` (`env-file`, `holder`, `lock`, `open-browser` specs). Rules that keep
the suite off the developer's machine:

- Point `OWLMEANS_CREDENTIALS` at a temp path — never let a test read the real `~/.owlmeans`.
- Holder tests use a **distinct `apiUrl` per test**: `inFlightByApiUrl` is module-level, so a shared
  URL leaks a pending sign-in from one test into the next.
- `holder.spec.ts` replaces `globalThis.fetch` with a fake device-flow server (metadata,
  `device_authorization` with `interval: 0.001`, a token endpoint that stays `authorization_pending`
  for N polls, revoke) and restores it in `afterEach`; never wait out a real 5 s interval.
- Anything that spawns a CLI passes `OWLMEANS_NO_BROWSER=1` and deletes the token and any URL
  override variables from the inherited environment.
