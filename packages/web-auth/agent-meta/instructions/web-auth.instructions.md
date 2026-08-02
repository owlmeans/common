---
description: "How to use @owlmeans/web-auth — web auth UI plugins registering into @owlmeans/client-auth/manager. Ships the development-only PK-based supervisor login form via appendSupervisorAuth. Use when adding the supervisor login UI to a web app."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-auth

Web-side auth UI plugins that register into `@owlmeans/client-auth/manager` (mirrors
`@owlmeans/web-oidc-rp`). Currently ships the **development-only PK-based supervisor** login form.

```ts
import { appendSupervisorAuth } from '@owlmeans/web-auth'
appendSupervisorAuth(context) // in web makeContext(); dev-only by default (cfg.debug)
```

- Form renders at `SUPERVISOR_LOGIN_PATH` (`/authentication/login/pk-supervisor`) via the standard
  typed auth route — no extra route registration.
- Side-effect always-on alternative: `import '@owlmeans/web-auth/auth/plugins'`.
- Test ids: `supervisor-auth-form`, `supervisor-user-id`, `supervisor-pk`, `supervisor-submit`,
  `supervisor-error`.
- Full feature (server side, options, security, test helpers): see the **supervisor-auth** instruction.
