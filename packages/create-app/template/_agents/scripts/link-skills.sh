#!/bin/sh
# link-skills.sh
#
# Bridge every skill an agent should see into the two places agents look:
#
#   1. LOCAL   .agents/skills/<name>          -> .claude/skills/<name>
#   2. LINKED  <upstream>/.agents/skills/<n>  -> .agents/linked-skills/<n>
#                                            -> .claude/skills/<n>
#
# Copilot and Codex read .agents/skills/ and .agents/linked-skills/ natively;
# Claude Code discovers skills only under .claude/skills/, so both passes land
# there too.  Each skill becomes its own symlink — Claude Code supports
# per-skill symlink entries, but not a symlinked skills directory.
#
# USAGE
#   sh .agents/scripts/link-skills.sh
#
# BEHAVIOUR
#   - creates .claude/skills/<name> -> ../../.agents/skills/<name> for every
#     .agents/skills/<name>/SKILL.md
#   - resolves the upstream repos this one depends on from the root
#     package.json workspace entries of the form "libraries/<dep>/packages/...",
#     recursing into each upstream's own package.json (visited list, depth cap
#     of 4).  A repo that declares no libraries/* workspace entries falls back
#     to node_modules/@owlmeans/*/agent-meta/skills/<name>, the layout a
#     standalone npm consumer gets.
#   - links every upstream skill that no local skill shadows into BOTH
#     .agents/linked-skills/<name> and .claude/skills/<name>, pointing at the
#     upstream's real directory (never at another symlink).  A local skill
#     always wins; a nearer dependency wins over a farther one.
#   - writes .agents/linked-skills/INDEX.md — skill / origin repo / description
#     in deterministic order — and rewrites it only when its content changes
#   - prunes symlinks in both directories that dangle or no longer have a
#     SKILL.md behind them, and removes .agents/linked-skills/ entirely when
#     the repo has no upstream skills
#   - never touches real directories or files (warns instead), never removes
#     .gitkeep, and always exits 0 so it can run as a SessionStart hook
#
# The committed .claude/settings.json runs this at SessionStart.  Run it by
# hand after creating, renaming, or deleting a skill mid-session.
#
# .agents/linked-skills/ is generated and git-ignored: the upstream repos are
# themselves symlinks, so the links only make sense inside a linked checkout.

set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
ROOT=$(cd "$SCRIPT_DIR/../.." && pwd -P)
SRC="$ROOT/.agents/skills"
DST="$ROOT/.claude/skills"
LNK="$ROOT/.agents/linked-skills"
MAX_DEPTH=4

NL='
'
TAB=$(printf '\t')

linked=0
dep_linked=0
pruned=0
skipped=0

mkdir -p "$DST" 2>/dev/null || true
[ -f "$DST/.gitkeep" ] || : > "$DST/.gitkeep" 2>/dev/null || true

# ---- local link pass -------------------------------------------------------
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

# ---- dependency resolution -------------------------------------------------
# An OwlMeans monorepo declares a linked upstream by listing that upstream's
# packages explicitly as "libraries/<dep>/packages/<pkg>" workspace entries.
# The dep name is therefore the second path segment of any such entry.
deps_of() {
    pkg="$1/package.json"
    [ -f "$pkg" ] || return 0
    grep -o '"libraries/[A-Za-z0-9._-][A-Za-z0-9._-]*/packages' "$pkg" 2>/dev/null \
        | sed 's|^"libraries/||; s|/packages$||' \
        | awk '!seen[$0]++'
}

# Resolve libraries/<dep> to the real directory it points at, so every link we
# create later targets a real path rather than a chain of symlinks.
resolve_repo() {
    p="$1/libraries/$2"
    [ -d "$p" ] || return 0
    (cd "$p" 2>/dev/null && pwd -P)
}

# Breadth-first walk: the frontier holds one depth level, so the first repo to
# claim a skill name is always the nearest dependency.
visited="$NL$ROOT$NL"
order=""
frontier=""
while IFS= read -r dep; do
    [ -n "$dep" ] || continue
    rp=$(resolve_repo "$ROOT" "$dep")
    [ -n "$rp" ] && frontier="$frontier$rp$NL"
done <<EOF
$(deps_of "$ROOT")
EOF

depth=1
while [ "$depth" -le "$MAX_DEPTH" ] && [ -n "$frontier" ]; do
    next=""
    while IFS= read -r rp; do
        [ -n "$rp" ] || continue
        case "$visited" in
            *"$NL$rp$NL"*) continue ;;
        esac
        visited="$visited$rp$NL"
        order="$order$rp$NL"
        while IFS= read -r dep; do
            [ -n "$dep" ] || continue
            crp=$(resolve_repo "$rp" "$dep")
            [ -n "$crp" ] && next="$next$crp$NL"
        done <<EOF
$(deps_of "$rp")
EOF
    done <<EOF
$frontier
EOF
    frontier="$next"
    depth=$((depth + 1))
done

# ---- candidate collection --------------------------------------------------
TMPD=$(mktemp -d 2>/dev/null) || TMPD="${TMPDIR:-/tmp}/link-skills.$$"
mkdir -p "$TMPD" 2>/dev/null || true
CAND="$TMPD/candidates"
: > "$CAND" 2>/dev/null || CAND=""

seen_names="$NL"
chain=""

record_candidate() {
    cname="$1"
    corigin="$2"
    cpath="$3"
    [ -f "$cpath/SKILL.md" ] || return 0
    # A local skill always shadows an upstream one of the same name.
    [ -f "$SRC/$cname/SKILL.md" ] && return 0
    case "$seen_names" in
        *"$NL$cname$NL"*) return 0 ;;
    esac
    seen_names="$seen_names$cname$NL"
    printf '%s\t%s\t%s\n' "$cname" "$corigin" "$cpath" >> "$CAND"
}

if [ -n "$CAND" ] && [ -n "$order" ]; then
    while IFS= read -r rp; do
        [ -n "$rp" ] || continue
        origin=$(basename "$rp")
        chain="$chain$origin -> "
        for skill_dir in "$rp"/.agents/skills/*/; do
            [ -d "$skill_dir" ] || continue
            skill_dir="${skill_dir%/}"
            record_candidate "$(basename "$skill_dir")" "$origin" "$skill_dir"
        done
    done <<EOF
$order
EOF
    chain="${chain% -> }"
elif [ -n "$CAND" ]; then
    # Standalone consumer: no libraries/* upstreams, so the skills ship inside
    # the installed packages as generated agent-meta/ copies.
    for pkg_dir in "$ROOT"/node_modules/@owlmeans/*/; do
        [ -d "$pkg_dir" ] || continue
        pkg_dir="${pkg_dir%/}"
        origin="@owlmeans/$(basename "$pkg_dir")"
        for skill_dir in "$pkg_dir"/agent-meta/skills/*/; do
            [ -d "$skill_dir" ] || continue
            skill_dir="${skill_dir%/}"
            record_candidate "$(basename "$skill_dir")" "$origin" "$(cd "$skill_dir" && pwd -P)"
        done
    done
    [ -s "$CAND" ] && chain="node_modules/@owlmeans/*/agent-meta/skills"
fi

cand_has() {
    [ -n "$CAND" ] && [ -f "$CAND" ] || return 1
    awk -F"$TAB" -v n="$1" '$1 == n { found = 1 } END { exit found ? 0 : 1 }' "$CAND"
}

# ---- dependency link pass --------------------------------------------------
if [ -n "$CAND" ] && [ -s "$CAND" ]; then
    mkdir -p "$LNK" 2>/dev/null || true
    while IFS="$TAB" read -r name origin path; do
        [ -n "$name" ] || continue
        ok=1
        for target in "$LNK/$name" "$DST/$name"; do
            if [ -e "$target" ] && [ ! -L "$target" ]; then
                echo "link-skills: skip '$name' — a real file/directory shadows it in $(dirname "$target")" >&2
                ok=0
                continue
            fi
            ln -sfn "$path" "$target" 2>/dev/null || {
                echo "link-skills: failed to link '$name' from $origin" >&2
                ok=0
            }
        done
        if [ "$ok" -eq 1 ]; then
            dep_linked=$((dep_linked + 1))
        else
            skipped=$((skipped + 1))
        fi
    done < "$CAND"
fi

# ---- index -----------------------------------------------------------------
# Read the description straight out of the SKILL.md frontmatter; fall back to
# the first heading.  Pipes would break the table, so they are folded away.
describe() {
    f="$1/SKILL.md"
    [ -f "$f" ] || return 0
    d=$(sed -n '/^---[[:space:]]*$/,/^---[[:space:]]*$/p' "$f" \
        | sed -n 's/^description:[[:space:]]*//p' | head -1)
    [ -n "$d" ] || d=$(sed -n 's/^#[[:space:]][[:space:]]*//p' "$f" | head -1)
    d=$(printf '%s' "$d" | sed "s/^[\"']//; s/[\"']\$//; s/|/\//g")
    if [ "${#d}" -gt 160 ]; then
        d=$(printf '%s' "$d" | cut -c1-157)...
    fi
    printf '%s' "$d"
}

if [ -n "$CAND" ] && [ -s "$CAND" ]; then
    {
        echo "# Linked Skills"
        echo ""
        echo "Generated by \`.agents/scripts/link-skills.sh\` — never edit by hand, and never"
        echo "commit: the entries are symlinks into checkouts that only exist locally."
        echo ""
        echo "These skills belong to the repositories this one depends on. They are readable at"
        echo "\`.agents/linked-skills/<name>/SKILL.md\` and are loaded by Claude Code through"
        echo "\`.claude/skills/\` like any local skill. A local skill of the same name always wins,"
        echo "and a nearer dependency wins over a farther one."
        echo ""
        echo "Dependency order: $chain"
        echo ""
        echo "| skill | origin repo | description |"
        echo "|---|---|---|"
        LC_ALL=C sort -t"$TAB" -k1,1 "$CAND" | while IFS="$TAB" read -r name origin path; do
            [ -n "$name" ] || continue
            printf '| %s | %s | %s |\n' "$name" "$origin" "$(describe "$path")"
        done
    } > "$TMPD/INDEX.md" 2>/dev/null

    if [ -f "$TMPD/INDEX.md" ]; then
        if cmp -s "$TMPD/INDEX.md" "$LNK/INDEX.md" 2>/dev/null; then
            :
        else
            cp "$TMPD/INDEX.md" "$LNK/INDEX.md" 2>/dev/null || true
        fi
    fi
fi

# ---- prune pass ------------------------------------------------------------
if [ -d "$DST" ]; then
    for entry in "$DST"/* "$DST"/.[!.]*; do
        [ -e "$entry" ] || [ -L "$entry" ] || continue
        name=$(basename "$entry")
        [ "$name" = ".gitkeep" ] && continue
        [ -L "$entry" ] || continue

        if [ -f "$SRC/$name/SKILL.md" ]; then
            continue
        fi
        if cand_has "$name" && [ -f "$entry/SKILL.md" ]; then
            continue
        fi
        rm -f "$entry" 2>/dev/null && pruned=$((pruned + 1))
    done
fi

if [ -d "$LNK" ]; then
    for entry in "$LNK"/*; do
        [ -e "$entry" ] || [ -L "$entry" ] || continue
        name=$(basename "$entry")
        [ "$name" = "INDEX.md" ] && continue
        [ -L "$entry" ] || continue

        if cand_has "$name" && [ -f "$entry/SKILL.md" ]; then
            continue
        fi
        rm -f "$entry" 2>/dev/null && pruned=$((pruned + 1))
    done
    # Nothing linked at all — leave no empty generated directory behind.
    if [ -z "${CAND:-}" ] || [ ! -s "$CAND" ]; then
        rm -f "$LNK/INDEX.md" 2>/dev/null || true
        rmdir "$LNK" 2>/dev/null || true
    fi
fi

rm -rf "$TMPD" 2>/dev/null || true

summary="link-skills: $linked linked, $pruned pruned"
[ "$dep_linked" -gt 0 ] && summary="$summary, $dep_linked from dependencies"
[ "$skipped" -gt 0 ] && summary="$summary, $skipped skipped"
echo "$summary"

exit 0
