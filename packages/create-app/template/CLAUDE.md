@AGENTS.md

## Claude Code bridge

All guidance lives in `AGENTS.md` (imported above) and in skills under
`.agents/skills/<name>/SKILL.md` — the single canonical location shared with Copilot
and Codex. `.claude/skills/` holds only generated per-skill symlinks (gitignored
except `.gitkeep`); the committed `SessionStart` hook runs
`sh .agents/scripts/link-skills.sh` to (re)create them each session.

- Never author files under `.claude/skills/` — write skills in `.agents/skills/`.
- After creating, renaming, or deleting a skill, re-run
  `sh .agents/scripts/link-skills.sh` so this session picks it up.
