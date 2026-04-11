---
name: versioning
description: Package versioning conventions for the OwlMeans Common monorepo — synchronized versions, internal dep references, and how dep-config is referenced differently.
type: project
---

All ~75 packages are synchronized at the same version (currently `0.1.2`). Internal cross-package deps use caret range `^0.1.2`. The `@owlmeans/dep-config` package is always referenced as `workspace:*` because it has no runtime code (config files only).

**Why:** Synchronized versioning simplifies releases and ensures packages in the monorepo always work together.

**How to apply:** When bumping versions, update ALL packages at once with sed. See `.claude/skills/versions/SKILL.md` for the exact commands.
