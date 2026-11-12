# @owlmeans/captcha

The server half of OwlMeans captcha, provider-neutral: the host a captcha provider plugs into, the
lenient policy of the `captcha` guest sign-in of `@owlmeans/server-auth`, and a strict,
challenge-less check a route runs on a score-based token before it acts — sends a mail, checks a
password. It names no captcha service and has no built-in provider: a provider package (in OwlMeans
connect) registers one explicitly. The browser half is `@owlmeans/web-captcha`.

## Installation

```bash
bun add @owlmeans/captcha@^0.2.0-alpha.1
```

## Concepts

- **Provider** — a `CaptchaProvider` `{ id, verify(token, { action?, remoteIp? }), clientSettings() }`:
  `verify` answers a neutral `CaptchaVerdict` (`success`, `score`, `action`, `hostname`, `at`,
  `errors`); a refused token is a verdict, an unreachable service `AuthUnavailable`.
  `clientSettings()` is what a browser needs: `{ provider, siteKey }`.
- **Host** — `ensureCaptchaService(ctx)` registers the context's host (a lazy service under
  `CAPTCHA_SERVICE`) on first use; a provider package's `append*` calls
  `ensureCaptchaService(ctx).register(provider)`. `captchaResolverOf(ctx)` reads it without ever
  registering one.
- **Fail closed** — settings without their provider are a boot error
  (`PluginMissconfigured('captcha:provider:<id>')`), never a sign-in without captcha; no settings and
  no provider = captcha off.
- **Lenient policy** — the host record `MOD_CAPTCHA` (`'_external:captcha'`,
  `{ provider?, hostnames?, minScore?, actions? }`, no secret) turns the guest sign-in on;
  `makeCaptchaPolicyModel(record)` judges a verdict by it, every field optional (`''` = no check).
- **Strict check** — `makeCaptchaCheck(ctx, settings)` is off for `null` settings. Once on nothing is
  optional: the provider must be registered and have a site key, a score is required, the hostname
  list must not be empty and every call names the exact action its token must carry. Incomplete
  settings fail closed with `AuthUnavailable('captcha:config')` (logged once per check).

## Usage

```typescript
import { makeCaptchaCheck } from '@owlmeans/captcha'

appendMyCaptchaProvider(context)          // a provider package's append helper, while setting up

const captcha = makeCaptchaCheck(context, {
  provider: 'my-provider',                 // absent = the only registered provider
  hostnames: 'example.org, example.com',   // or ['example.org', 'example.com']
  minScore: '0.5',                         // or 0.5
})

captcha.assertReady()                       // at boot: throws when the provider is not registered
const view = { captcha: captcha.clientSettings() }   // { provider, siteKey } | null — advertise to the browser
await captcha.assert({ token: body.captcha, action: 'email_pin', remoteIp })   // before acting
```

A test registers a stand-in provider — no network:

```typescript
ensureCaptchaService(context).register({
  id: 'test',
  verify: async () => ({ success: true, hostname: 'example.org', score: 0.9, action: 'email_pin' }),
  clientSettings: () => ({ provider: 'test', siteKey: 'site-key' }),
})
```

## API

| Export | Description |
|---|---|
| `createCaptchaService(alias?)`, `ensureCaptchaService(ctx)` | The host: `register(provider)`, `get(id?)`, `list()` |
| `makeCaptchaResolver(ctx)`, `captchaResolverOf(ctx)` | `find(id?)`, `provider(id?)` (throws), `record()`, `assertReady()` |
| `makeCaptchaCheck(ctx, settings \| null)` | `CaptchaCheck`: `enabled()`, `clientSettings()`, `assertReady()`, `assert({ token, action, remoteIp? })` |
| `makeCaptchaPolicyModel(record)` | The lenient policy: `hostnames()`, `minScore()`, `actions()`, `assert(verdict)` |
| `CAPTCHA_SERVICE`, `MOD_CAPTCHA` | `'captcha'`, `'_external:captcha'` |
| `CaptchaProvider`, `CaptchaVerdict`, `CaptchaVerifyOptions`, `CaptchaClientSettings` | The provider contract |
| `CaptchaService`, `CaptchaResolver` | The host and its reader |
| `CaptchaSettings`, `CaptchaCheckRequest`, `CaptchaCheck` | The strict check's types |
| `CaptchaPolicyRecord`, `CaptchaPolicyModel` | The lenient policy's types |

### Strict check refusals

All refusals are `AuthenFailed` (401), in this order:

| Reason | When |
|---|---|
| `captcha:missing` | no token |
| `captcha:<errors>` / `captcha:unknown` | the provider's own refusal |
| `captcha:score` | no numeric score, or below `minScore` |
| `captcha:hostname` | the verdict's host is neither a listed host nor a subdomain of one |
| `captcha:action` | the verdict's action is not exactly the call's `action` |

`AuthUnavailable` (503): `captcha:config` (on without a registered provider, with a provider that has
no site key, an empty hostname list or a `minScore` outside 0…1) and whatever the provider throws
when it cannot be asked (`captcha`).

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.2
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
