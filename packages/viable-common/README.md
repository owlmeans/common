# @owlmeans/viable-common

Runtime-free contracts of the OwlMeans Viable platform.

Viable turns a description into a running full-stack application. Four runtimes have to agree
about every name involved — the manager API, the agent, the publisher that runs inside a project
slot, and the connector SDK on a developer's machine — so each of those names is declared here
once and imported by all of them. There is no runtime in this package: no `@langchain/*`, no
filesystem, no inference SDK. It is safe to import from a browser bundle.

## What is in it

| Subpath | Contents |
|---|---|
| `.` | The shapes a generated project is described by: user stories and entities, the design and scaffold plans, UX/UI specs, the `docs/` metadata paths, the four user areas, the model roles and personas, moderation categories, slot metadata |
| `@owlmeans/viable-common/slot` | The slot command vocabulary — file, shell and git commands, the sub-project roles, the target's ports and process markers |
| `@owlmeans/viable-common/connect` | The connector protocol: sessions, operations, model tasks, questions, jobs, capabilities, the error family, and `connectEntrypoints()` — the one declaration both the platform and the SDK elevate |
| `@owlmeans/viable-common/convert` | Converting an application that already exists: the stages and their transitions, the origin and stack taxonomy, the census classifiers, and the `docs/conversion/` layout |
| `@owlmeans/viable-common/integrity` | The target-shape manifest — what a slot is allowed to install, build and run — per target layout |

## Installation

```bash
bun add @owlmeans/viable-common@^0.0.6
```

## Rules worth knowing before you change something

**A schema is written for the reader that will refuse it.** Model-answer schemas are annotated
`JSONSchemaType<T>` so a drift from the type is caught where it is written; record schemas are
hand-written and cast, because they are re-applied as a Mongo `$jsonSchema`, which admits no
`Record<>` maps, no `integer` and no date objects.

**`nullable: true` always carries its `type`, and a nullable `enum` lists `null` among its
values.** Ajv checks `nullable` and `enum` independently, so the pair written apart admits `null`
by type and then refuses it by enum — the field can only ever be omitted, never sent empty. A
provider's structured output writes an unset optional as `null`, and a wire body where `null`
means "inherit" has no other spelling. `tests/convert.spec.ts` walks every exported schema for
both faults, and for draft-04 tuple `items`.

**A field that crosses a version skew carries no `enum`.** A connector is installed with
`npx -y @owlmeans/viable-mcp@^0.1.18-rc.1` and talks to a separately deployed platform, so an executor kind it
sends must remain an unused capability on an older platform rather than a refused session.

**A ceiling exists once.** The inquiry answer cap here equals `DEFAULT_INQUIRY_ANSWER_CHARS` in
`@owlmeans/llm-common` and must stay equal; two ceilings mean the larger one truncates silently
at the smaller.

## Related

- `@owlmeans/viable-sdk` — the connector SDK written against these contracts
- `@owlmeans/viable-mcp` — the npx MCP server built on that SDK

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.14
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
