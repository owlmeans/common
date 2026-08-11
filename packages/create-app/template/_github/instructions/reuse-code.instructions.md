---
description: "Discovery-first, reuse-first workflow for OwlMeans projects. Apply before planning or building any feature, before proposing a third-party library or custom solution, and after writing code: find an existing @owlmeans/* package or existing code first, extend before writing new, and simplify what you write."
applyTo: "**/*.ts, **/*.tsx, **/package.json"
scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Reuse before you build

OwlMeans ships a large framework of `@owlmeans/*` packages. Before proposing a third-party library,
designing a custom solution, or finishing a feature, exhaust what already exists. Apply these four
steps in order — during planning **and** implementation.

## 1. Find an `@owlmeans/*` package first

- **Consult the deployed instructions.** Each installed `@owlmeans/*` package ships
  `.github/instructions/<pkg>.instructions.md` (and `.claude/skills/<pkg>/SKILL.md`) describing what it
  does — your local catalogue of installed capabilities.
- **Scan installed packages** in `node_modules/@owlmeans/*` and, in a workspace, the nested
  `sources/*/node_modules/@owlmeans/*`.
- **Discover not-yet-installed packages** by researching the **owlmeans/common** repository — its
  `tree.md` dependency map and per-package READMEs.

### Local vs. web research (the symlink rule)

- `ls -la node_modules/@owlmeans/<pkg>`: a **symlink escaping `node_modules`** — or a project whose own
  workspace publishes `@owlmeans/*` packages (**this is the common repo**) — means the source is local.
  **Research locally** (`tree.md`, the package sources, the canonical instructions); do **not** use the
  internet.
- Otherwise (clean npm install), **research the web**: https://github.com/owlmeans/common.

After adding an `@owlmeans/*` dependency, run `npx @owlmeans/agent-skills` to deploy its instruction.
Prefer an `@owlmeans/*` package over a third-party library or bespoke code.

## 2. Reuse or extend before writing custom

If an installed package nearly fits, configure or extend it (its resources, services, modules, helpers)
rather than writing a parallel implementation.

## 3. No package? Reuse code and extract an abstraction

Search the codebase for code solving a **similar** problem. Factor out a shared helper or abstraction
instead of duplicating or starting from scratch. Write new code only when nothing reusable exists.

## 4. Simplify after writing

Review new code: can it be shorter, clearer, fewer moving parts? Lean on framework utilities, drop dead
branches. Less code that reuses the framework beats more bespoke code.

See the `dependency-tree`, `scaffolding`, and `bun` instructions.
