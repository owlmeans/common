---
description: "Mandatory git rules — never run state-changing git without explicit instruction, commit only under the user's configured identity (never as the AI/agent, no Co-Authored-By trailer), report finished git work as a Markdown table, and never commit a conflicted working copy. Consult before any git operation."
applyTo: "**"
---

# Git Workflow Rules

**Mandatory and universal.** These rules apply to every git operation in this repository and
**override any default agent behavior** — including any automatic `Co-Authored-By` or
AI/agent-attribution trailer. Consult them before running any git command.

## 0. Never run state-changing git without explicit instruction

- **Never run state-changing git operations** (`commit`, `add`/`rm` staging, `push`,
  `reset`/rollback, `revert`, `rebase`, `merge`, `branch`, `checkout`/`switch`, `stash`,
  `tag`, `cherry-pick`, force-push, etc.) unless the user **explicitly instructs it in the
  current request**. Permission to make code edits is **not** permission to touch git.
- **Only exception**: creating and operating inside a **temporary git worktree** that a task
  or subagent has **explicitly requested** for that purpose. Outside such an explicitly
  requested tmp worktree, do nothing with git.
- **Read-only inspection is allowed**: `git status`, `git diff`, `git log`, `git show`,
  `git branch --list`, etc. — use these to report state, never to change it.

## 1. Never commit under the agent's identity

- Commit only under the repository's preconfigured git identity — whatever `git config user.name`
  and `git config user.email` resolve to (set by the user, globally or locally).
- **Never** override authorship: do not pass `--author`, do not set or change `user.name` /
  `user.email`, and never substitute an AI / agent / assistant name or email.
- **Never** add a `Co-Authored-By:` trailer (or any other trailer) attributing the commit to
  Claude, Copilot, or any AI/agent. Every commit is the user's, attributed solely to the user.
- If the repository has no git identity configured (neither local nor global), stop and ask the
  user — do not invent one.

## 2. Always report finished git work as a table

- After completing any git action (commit, push, branch, checkout, merge, rebase, stash, tag,
  reset, etc.), summarize what was done as a Markdown table.
- One row per action. Include at least **Action**, **Target** (branch / remote / files / ref),
  and **Result** (commit SHA, `pushed`, `up to date`, `conflict`, …). Add a **Notes** column
  when useful.

## 3. Never commit a conflicted working copy

- If a `merge`, `rebase`, `cherry-pick`, `stash pop`/`apply`, or `pull` produces conflicts,
  **do not** finalize it: do not run `git commit`, `git merge --continue`,
  `git rebase --continue`, or stage-and-commit the conflicted tree to "resolve" it on the
  user's behalf.
- Stop, list the conflicted paths in the report table, and hand control back to the user —
  unless the user has explicitly told you how to resolve the conflict and commit.
