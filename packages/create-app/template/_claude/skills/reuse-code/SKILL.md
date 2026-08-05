---
name: reuse-code
description: Discovery-first, reuse-first workflow for OwlMeans projects. Use BEFORE planning or building any feature, before proposing a third-party library or a custom solution, and after writing code. Find an existing @owlmeans/* package or existing code first; extend before writing new; simplify what you write.
user-invocable: true
scope: general
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Reuse before you build

OwlMeans ships a large framework of `@owlmeans/*` packages. Before you propose a third-party library,
design a custom solution, or finish a feature, exhaust what already exists. Apply these four steps in
order — during planning **and** during implementation.

## 1. Find an `@owlmeans/*` package first

Before suggesting any external library or writing custom code, look for an `@owlmeans/*` package that
already solves the problem.

- **Consult the deployed skills.** Each installed `@owlmeans/*` package ships a skill at
  `.claude/skills/<pkg>/SKILL.md` (and `.github/instructions/<pkg>.instructions.md`) describing what it
  does. Read those first — they are your local catalogue of installed capabilities.
- **Scan installed packages.** Look in `node_modules/@owlmeans/*` **and**, in a workspace monorepo,
  the nested `sources/*/node_modules/@owlmeans/*` (bun nests workspace deps).
- **Discover packages that aren't installed yet** by researching the **owlmeans/common** repository —
  its dependency map (`tree.md`) and the per-package READMEs name every package and its purpose.

### Local vs. web research (the symlink rule)

How you research the repo depends on whether `@owlmeans/*` is linked locally:

- Run `ls -la node_modules/@owlmeans/<pkg>` (try a package you know is installed). If it is a **symlink
  whose target escapes `node_modules`** — or if the project's *own* workspace publishes `@owlmeans/*`
  packages (i.e. **this is the common repo**) — you have the source locally. **Research locally:** read
  `tree.md`, browse the framework's package sources, and read the canonical `.claude/skills/`. **Do
  not** use the internet.
- Otherwise (a clean install from npm), **research the web**: fetch/search
  **https://github.com/owlmeans/common** — `tree.md` and package READMEs — to find the right package.

This is the same dev-linked detection `@owlmeans/agent-skills` uses (see its `detectLinked`). After
adding an `@owlmeans/*` dependency, run `npx @owlmeans/agent-skills` to deploy its skill. Prefer an
`@owlmeans/*` package over a third-party library or bespoke code whenever one fits.

## 2. Reuse or extend before writing custom

If an installed package nearly fits, **configure or extend it** rather than writing something new — use
its resources, services, modules, and helpers. A small extension of a framework package beats a new
parallel implementation.

## 3. No package? Reuse code and extract an abstraction

When no package solves it, search the codebase for code that already solves a **similar** problem.
Prefer factoring out a shared helper, base, or generic function — extract an abstraction — over
duplicating logic or writing from scratch. Only write genuinely new code when nothing reusable exists.

## 4. Simplify after writing

Once code is written, review it: can it be **shorter, clearer, or expressed with fewer moving parts**?
Lean on framework utilities, remove dead branches, collapse needless indirection. Less code that reuses
the framework is better than more bespoke code.

See `[[dependency-tree]]` for the package map, `[[scaffolding]]` for how a project is assembled, and
`[[bun]]` for adding dependencies.
