---
name: sync-agent-meta-gotchas
description: Sharp edges when running the library-manager sync-agent-meta.ts script — --filter prune behavior (now fixed), README marker side effect, and how to add general-scope skills.
metadata:
  type: project
---

`bun run scripts/sync-agent-meta.ts --project common` (run from `/home/igor/projects/owlmeans/library-manager`) regenerates every package's embedded `agent-meta/`.

**`--filter` prune behavior — FIXED.** The prune loop now skips packages excluded by `--filter`, so `--filter @owlmeans/context` only processes that one package and prunes nothing else. (Historically this was destructive — a `--filter agent-skills` run once wiped 78 packages. Now safe.)

**Gotcha — README marker side effect.** A full sync may also rewrite/strip the `<!-- owlmeans:agent-guidance:start -->…<!-- :end -->` block in many `packages/*/README.md` (the local script can drift from whatever generated the committed markers). After syncing, review `git status` and revert unrelated `packages/*/README.md` changes to keep the diff surgical.

**How to add a general skill (installer extra):** add `scope: general` to the skill/instruction frontmatter. The sync reads the marker automatically, routes to `@owlmeans/agent-skills`, emits `"category": "general"` in the manifest, and the prune loop protects the installer package dir. No `MULTI_PACKAGE_LEADS` entry needed. Mark both SKILL.md and the matching `.instructions.md` (or mark just SKILL.md — the sync unifies the scope to both by name).

**Recovery if something goes wrong:** `git ls-files --deleted | grep '/agent-meta/' | xargs git checkout --`. Related: [[versioning]].
