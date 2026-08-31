#!/bin/sh
# link-skills.sh
#
# Bridge the canonical skill store (.agents/skills/) into .claude/skills/ for
# Claude Code, which discovers skills only under .claude/skills/.  Copilot and
# Codex read .agents/skills/ natively and need nothing from this script.
#
# Each skill becomes its own symlink — Claude Code supports per-skill symlink
# entries, but not a symlinked skills directory.
#
# USAGE
#   sh .agents/scripts/link-skills.sh
#
# BEHAVIOUR
#   - creates .claude/skills/<name> -> ../../.agents/skills/<name> for every
#     .agents/skills/<name>/SKILL.md
#   - prunes symlinks that dangle or no longer have a SKILL.md behind them
#   - never touches real directories or files (warns instead), never removes
#     .gitkeep, and always exits 0 so it can run as a SessionStart hook
#
# The committed .claude/settings.json runs this at SessionStart.  Run it by
# hand after creating, renaming, or deleting a skill mid-session.

set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SRC="$ROOT/.agents/skills"
DST="$ROOT/.claude/skills"

linked=0
pruned=0
skipped=0

mkdir -p "$DST" 2>/dev/null || true
[ -f "$DST/.gitkeep" ] || : > "$DST/.gitkeep" 2>/dev/null || true

# ---- link pass -------------------------------------------------------------
if [ -d "$SRC" ]; then
    for skill_dir in "$SRC"/*/; do
        [ -d "$skill_dir" ] || continue
        skill_dir="${skill_dir%/}"
        name=$(basename "$skill_dir")
        [ -f "$skill_dir/SKILL.md" ] || continue

        target="$DST/$name"
        if [ -e "$target" ] && [ ! -L "$target" ]; then
            echo "link-skills: skip '$name' — a real file/directory shadows it in .claude/skills/" >&2
            skipped=$((skipped + 1))
            continue
        fi

        ln -sfn "../../.agents/skills/$name" "$target" 2>/dev/null || {
            echo "link-skills: failed to link '$name'" >&2
            skipped=$((skipped + 1))
            continue
        }
        linked=$((linked + 1))
    done
fi

# ---- prune pass ------------------------------------------------------------
if [ -d "$DST" ]; then
    for entry in "$DST"/* "$DST"/.[!.]*; do
        [ -e "$entry" ] || [ -L "$entry" ] || continue
        name=$(basename "$entry")
        [ "$name" = ".gitkeep" ] && continue
        [ -L "$entry" ] || continue

        if [ ! -e "$entry" ] || [ ! -f "$SRC/$name/SKILL.md" ]; then
            rm -f "$entry" 2>/dev/null && pruned=$((pruned + 1))
        fi
    done
fi

if [ "$skipped" -gt 0 ]; then
    echo "link-skills: $linked linked, $pruned pruned, $skipped skipped"
else
    echo "link-skills: $linked linked, $pruned pruned"
fi

exit 0
