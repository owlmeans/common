---
node: agent-meta
scope: "packages/*/agent-meta/**, packages/agent-skills/**"
updated: 2026-08
---

# Agent-meta sync (sharp edges)

`bun run scripts/sync-agent-meta.ts --project common` (from library-manager) regenerates every
package's embedded `agent-meta/`. Schema: library-manager's `agent-meta` rule.

## Facts

- `--filter` prune behavior is FIXED — the prune loop skips filtered-out packages, so
  `--filter @owlmeans/context` touches only that package. (Historically destructive.)
- Adding a general skill (installer extra): put `scope: general` in the frontmatter (SKILL.md is
  enough — sync unifies scope to the twin by name); it auto-routes to `@owlmeans/agent-skills`,
  no `MULTI_PACKAGE_LEADS` entry needed.

## Gotchas

- README marker side effect: a full sync may rewrite/strip the
  `<!-- owlmeans:agent-guidance:start/end -->` block in many `packages/*/README.md` — review
  `git status` after sync and revert unrelated README churn.
- General skills are strict-linted for monorepo path tokens
  (`\b(libraries|apps|projects|packages)/…` — see `scanMonorepoPaths`); plain `sync` only WARNS
  and reports "updated", while `--check` runs strict and fails with exit 7. Always run `--check`
  after adding/editing a general skill; rephrase to drop literal `<word>/` tokens (`sources/` and
  `node_modules/` are not flagged).
- Recovery: `git ls-files --deleted | grep '/agent-meta/' | xargs git checkout --`.
