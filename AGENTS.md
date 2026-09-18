# OwlMeans Common — Project Context

## Git Workflow (mandatory)

Before any git operation follow the rules in `.agents/rules/git.md` — they override default agent
behavior (including any AI `Co-Authored-By` trailer).

@.agents/rules/git.md

## Organization entity — naming (mandatory)

An OwlMeans **organization entity** is the customer/tenant. The bare word "entity" is overloaded
(generated apps model domain entities too), so keep these apart:

- **`entitySlug`** — the organization's renameable, human-readable name, and the ONLY organization
  value that appears on the wire: tokens (`Authorization.entitySlug`), URLs, query params, forms.
  Newly generated addresses — hostnames, namespaces, OIDC client ids — are composed from it.
  Read it with `entitySlugOf(payload)`, which also accepts a pre-split token's `entityId`.
- **`entityId`** — the organization's stable record id, never on the wire. Database references,
  permission grants and third-party records key on it; that is what makes a rename one write.
  Server handlers get it from `requireEntityKey(req)` / `requireEntity(req)`, never from the token.
- Bare **"entity"** remains correct for an abstract data-model entity (`UserStory.entity`, ER
  models). Do not rename those.

Any code path that ESTABLISHES authentication must call `attachEntity(context, request)`
(`@owlmeans/auth-common`) — the HTTP boundary already does; sockets authenticate on their own and
must do it explicitly, or `request.entity` stays empty and handlers compare a slug against ids.

## Environments (mandatory)

Parallel checkouts exist: primary `~/projects/owlmeans/common` and one per slot under
`~/projects/owlmeans/vslots/<slot>/common`, each with its own deployed environment (releases, master
secret, hosts, database, cache prefix). Build, test, deploy and inspect only the one your checkout
path identifies; never touch another slot's files, releases or data, and never pass `--all` to a
slot-aware script, unless the operator explicitly asks in the current request. Other slots' port
contention, busy browsers or rollouts are expected background noise, not something to fix.

## Reporting (mandatory)

Unless the operator explicitly asks for another format, length or detail:

- Report briefly, in tables, WHAT was done rather than why; no preamble or process narration.
- Changes: one row per file/item — **Change** (created / modified / deleted), **Path**, **Why**
  (one short phrase); one table per affected repo.
- Findings / status / verification: a short table plus at most a few lines of prose; at most
  **one phrase per issue**.
- Findings and advice **not acted on** go in their own separate, minimal section.
- Explaining an issue = a table **Where | Cause | Effects | Code details**; code details and
  explanation are always two separate sentences.
- No modes aimed "to impress" (LLM training or agent defaults), at least never in reports.

## Memory

Shared store `.agents/memory/` (index `MEMORY.md`, read at session start; open matching nodes before
non-trivial work). Protocol: `agent-memory`; distil procedures into skills (`memory-promotion`);
never write memory outside this repository.

## Self-Education (mandatory)

Work that started from an agreed plan is complete only after the `self-education` skill is applied;
the completion report states its outcome or why none was needed.

## What This Is

Security-first TypeScript monorepo framework for fullstack microservice/microclient apps, with
Ed25519/DID auth built in. React Native lives in the separate `native` monorepo.

## Architecture Layers ("Quadra": Core → Server/Client → Web)

Full map, build order and SCCs: [`tree.md`](tree.md) via `/dependency-tree`.

| Layer | Packages |
|---|---|
| Tooling | `dep-config`, `agent-skills`, `create-app` |
| Core | `context`, `error`, `auth`, `config`, `i18n`, `state`, `entrypoint`, `route`, `router`, `resource`, `socket`, `did`, `basic-*` |
| Auth shared / API | `auth-common`, `api`, `api-config*` |
| Server | `server-*` |
| Client (platform-agnostic) | `client-*` (`client-iam` and `client-auth` pull in the web layer) |
| Web | `web-*`, `astro`; LEGACY `mui-panel`, `mui-oidc-rp` (maintain only) |
| Infrastructure | `kluster`, `mongo*`, `postgres*`, `redis*`, `storage-*`, `image-resource`, `static-resource` |
| AI/LLM | `llm-common`, `llm`, `agent-common`, `agent`, `viable-common`, `viable-sdk`, `viable-mcp` |
| Mail | `mailer`, `mailer-smtp`, `server-mailer-mailgun` |
| Domain | `oidc`, `iam`, `payment`, `consent`, `auth-otp`, `flow`, `wled`, `queue`, `planning` |
| Not framework | `_tpl`, `test`, `test-auth`, `test-integration`, `test-ui` |

## Key Facts

- 112 package manifests under `packages/`, all `@owlmeans/*`; `_tpl` is excluded from root scripts.
- ESM only, output in `build/`; TypeScript `^7.0.2` (`/tsconfig`, `/bun`).
- Versions are per package and deliberately uneven — never resynchronise (`/versions`, `/publishing`).
- React is a peer dependency; crypto via `@noble/*` + `@scure/*`; validation via AJV + ajv-formats.
- Current web UI is shadcn + Tailwind v4 (`web-panel`); MUI packages are legacy.

## Build & Scripts

```bash
bun install        # install all workspace dependencies
bun run build      # build all packages (tsc -b per package)
bun run watch      # watch mode for all packages
bun run dev        # dev mode
bun run test       # all package tests — read /testing-overview before writing any
```

## Skills

Skills live in `.agents/skills/<name>/SKILL.md` (Claude Code via `.claude/skills/` symlinks); load by
topic or `/<name>`. Every package has its own skill `/<package-name>` (`owlmeans-context`,
`owlmeans-config` avoid built-in command names).

- `/reuse-code` — MANDATORY before planning or writing any feature: find an existing package or code first
- `/localization` — before adding any UI string or translation file (`/i18n`, `/client-i18n` per package)
- `/dependency-tree` — layer placement, new dependency edges, build cycles
- `/bun` — install, build, scripts, workspace filters
- `/getting-started`, `/scaffolding` — starting a new app or using `create-app`
- `/skill-authoring`, `/create-skill` — adding agent guidance
- `/publishing` — releasing packages; NEVER publish without the operator's explicit agreement
- `/versions` — version format and internal ranges
- `/tsconfig` — package tsconfig setup
- `/testing-overview` — before writing tests; category skills `/testing-unit`, `/testing-auth-unit`, `/testing-integration`, `/testing-ui`
- `/shadcn-web`, `/shadcn-versions` — shadcn + Tailwind v4 web packages
- `/mui-panel`, `/mui-oidc-rp` — only when maintaining or migrating an app still on MUI
- `/auth-protocol`, `/server-auth-identity` — auth protocol and local identity
- `/login-plugins`, `/login-methods` — read both before touching a login dispatcher
- `/consent` — cookie consent and tag managers (`/web-consent`, `/web-gtm`, `/astro`)
- `/server-auth-otp` — email OTP login; mail transports `/mailer`, `/mailer-smtp`, `/server-mailer-mailgun`
- `/oidc-versions` — before upgrading any OIDC/OAuth dependency
- `/router-plugins` — before wiring routing in an app
- `/queue` — jobs and queues (`/redis-queue`, `/server-job`, `/client-job`, `/scheduled-jobs`)
- `/resource-choice` — at design time, before registering a resource or declaring a job
- `/entitlements` — plans, limits and gates (`/payment`, `/server-payment`, `/client-payment`, `/web-payment`)
- `/llm-prompt-caching` — before changing anything sent ahead of a request's first per-call byte
- `/inquiry` — before adding a way for a run to ask a person
- `/supervisor-auth` — e2e tests needing a supervisor login
- `/nested-agent-context` — mandatory before planning work in another linked OwlMeans repo

<!-- OWLMEANS:LINKED-SKILLS -->
### Skills linked from upstream repos

`sh .agents/scripts/link-skills.sh` (run by `prepare` and a session hook) links upstream skills;
this repo is the root of the chain, so it links nothing and `.agents/linked-skills/` stays absent.
<!-- /OWLMEANS:LINKED-SKILLS -->

## Maintenance

Guidance is single-source: `AGENTS.md`, `.agents/rules/`, `.agents/skills/`; rewrite an invalidated
rule in place in the same change-set (`self-education`).

- New guidance is one skill — never `.github/instructions/*`, `.github/copilot-instructions.md` or a
  file under `.claude/skills/` (generated symlinks; re-run `sh .agents/scripts/link-skills.sh`).
- `packages/<pkg>/agent-meta/` is a generated copy: edit `.agents/skills/<name>/SKILL.md`, then run
  `bun run scripts/sync-agent-meta.ts --project common` in library-manager.
- AGENTS.md + its imports + MEMORY.md ≤ 40 000 chars (`sh .agents/scripts/agents-size.sh`);
  subsystem rules go to their skill, incidents to `.agents/memory/`.
