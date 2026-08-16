#!/bin/sh
# nested-agent-context.sh
#
# Enumerate per-project agent guidance from direct children of libraries/ and
# apps/ (one level deep only — no recursion into a linked monorepo's own
# libraries/).
#
# PURPOSE
#   Before editing anything inside libraries/ or apps/, agents MUST run this
#   script and read every listed file whose description matches the planned
#   change.
#
# USAGE
#   sh .agents/skills/nested-agent-context/scripts/nested-agent-context.sh
#   sh .agents/skills/nested-agent-context/scripts/nested-agent-context.sh -p libraries/common
#   sh .agents/skills/nested-agent-context/scripts/nested-agent-context.sh -r libraries
#   sh .agents/skills/nested-agent-context/scripts/nested-agent-context.sh -h
#
# OPTIONS
#   -p <path>   Scope to a single child directory (e.g. libraries/common).
#               Must be a direct child of one of the scanned roots.
#   -r <root>   Scope to a single root directory name (e.g. libraries).
#   -h          Print this help text and exit.
#
# OUTPUT
#   For each child project that carries agent guidance:
#
#     == libraries/common ==
#     [agents-md]      libraries/common/AGENTS.md
#     [skill]          libraries/common/.agents/skills/context/SKILL.md
#                      -- How to use @owlmeans/context ...
#     [rule]           libraries/common/.agents/rules/git.md
#     [doc]            libraries/common/.agents/project-structure.md
#     [memory-index]   libraries/common/.agents/memory/MEMORY.md
#
#   Children that have not migrated to AGENTS.md + .agents/skills yet are
#   listed with [legacy-*] labels (copilot-instructions, instruction, skill,
#   rule, memory).  A legacy label is only emitted when its migrated
#   counterpart is absent, so a migrated child never double-lists the
#   generated .claude/skills symlinks.
#
# NOTES
#   - Symlinks are followed exactly one level; the child project's own
#     libraries/ subdirectory is never entered.
#   - Descriptions are extracted from YAML frontmatter (between the first two
#     '---' lines).  If absent, the first markdown heading line is used.
#     Files are never sourced or eval'd.
#   - Exits 0 even when no files are found.

set -eu

SCRIPT_NAME="nested-agent-context.sh"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

usage() {
    sed -n '/^# USAGE/,/^# OPTIONS/p' "$0" | grep -v '^# OPTIONS' | sed 's/^# \?//'
    echo ""
    sed -n '/^# OPTIONS/,/^# OUTPUT/p' "$0" | grep -v '^# OUTPUT' | sed 's/^# \?//'
    exit 0
}

# Extract the 'description:' value from YAML frontmatter (first --- block).
# Handles multi-line folded descriptions (lines starting with spaces after the
# initial value).  Prints nothing if no description found.
extract_description() {
    file="$1"
    awk '
    BEGIN { in_fm=0; found=0; desc=""; collecting=0 }
    /^---/ {
        if (in_fm == 0) { in_fm=1; next }
        else { exit }
    }
    in_fm && /^description:/ {
        found=1
        collecting=1
        # grab everything after "description:" on the same line
        sub(/^description:[[:space:]]*/, "")
        # strip surrounding quotes if present
        gsub(/^"/, ""); gsub(/"$/, "")
        gsub(/^'"'"'/, ""); gsub(/'"'"'$/, "")
        desc=$0
        next
    }
    in_fm && collecting && /^[[:space:]]/ {
        # continuation line of multi-line description
        gsub(/^[[:space:]]+/, "")
        desc=desc " " $0
        next
    }
    in_fm && collecting { collecting=0 }
    END {
        if (found) print desc
    }
    ' "$file"
}

# Fallback: first markdown heading line (# Heading).
extract_heading() {
    file="$1"
    grep -m1 '^#' "$file" 2>/dev/null | sed 's/^#\+[[:space:]]*//' || true
}

# Print a single file entry with optional description indented below.
print_entry() {
    label="$1"   # e.g. [skill]
    rel="$2"     # path relative to project root
    desc="$3"    # description string (may be empty)

    printf '    %-16s %s\n' "$label" "$rel"
    if [ -n "$desc" ]; then
        printf '                     -- %s\n' "$desc"
    fi
}

# ---------------------------------------------------------------------------
# Scan a single child project directory
# ---------------------------------------------------------------------------

scan_child() {
    child_dir="$1"  # absolute or relative path to the child
    child_label="$2"  # display label (e.g. libraries/common)

    found_anything=0

    # Track whether we printed the header yet (lazy header)
    header_printed=0
    print_header() {
        if [ "$header_printed" -eq 0 ]; then
            echo ""
            echo "== $child_label =="
            header_printed=1
            found_anything=1
        fi
    }

    # ---- AGENTS.md (canonical always-on guidance) ----
    agents_md="$child_dir/AGENTS.md"
    if [ -f "$agents_md" ]; then
        print_header
        desc=$(extract_heading "$agents_md")
        print_entry "[agents-md]" "$child_label/AGENTS.md" "$desc"
    else
        # ---- legacy: .github/copilot-instructions.md ----
        ci="$child_dir/.github/copilot-instructions.md"
        if [ -f "$ci" ]; then
            print_header
            desc=$(extract_description "$ci")
            [ -z "$desc" ] && desc=$(extract_heading "$ci")
            print_entry "[legacy-copilot]" "$child_label/.github/copilot-instructions.md" "$desc"
        fi
        # ---- legacy: CLAUDE.md (only when it is not a thin AGENTS.md bridge) ----
        cl="$child_dir/CLAUDE.md"
        if [ -f "$cl" ]; then
            print_header
            desc=$(extract_heading "$cl")
            print_entry "[legacy-claude]" "$child_label/CLAUDE.md" "$desc"
        fi
    fi

    # ---- .agents/skills/*/SKILL.md (canonical skills) ----
    skills_dir="$child_dir/.agents/skills"
    if [ -d "$skills_dir" ]; then
        while IFS= read -r f; do
            [ -f "$f" ] || continue
            print_header
            skill_name=$(basename "$(dirname "$f")")
            rel_f="$child_label/.agents/skills/$skill_name/SKILL.md"
            desc=$(extract_description "$f")
            [ -z "$desc" ] && desc=$(extract_heading "$f")
            print_entry "[skill]" "$rel_f" "$desc"
        done << EOF
$(find -L "$skills_dir" -maxdepth 2 -name 'SKILL.md' | sort)
EOF
    else
        # ---- legacy: .claude/skills/*/SKILL.md ----
        legacy_skills="$child_dir/.claude/skills"
        if [ -d "$legacy_skills" ]; then
            while IFS= read -r f; do
                [ -f "$f" ] || continue
                print_header
                skill_name=$(basename "$(dirname "$f")")
                rel_f="$child_label/.claude/skills/$skill_name/SKILL.md"
                desc=$(extract_description "$f")
                [ -z "$desc" ] && desc=$(extract_heading "$f")
                print_entry "[legacy-skill]" "$rel_f" "$desc"
            done << EOF
$(find -L "$legacy_skills" -maxdepth 2 -name 'SKILL.md' | sort)
EOF
        fi
        # ---- legacy: .github/instructions/*.instructions.md ----
        instr_dir="$child_dir/.github/instructions"
        if [ -d "$instr_dir" ]; then
            while IFS= read -r f; do
                [ -f "$f" ] || continue
                print_header
                rel_f="$child_label/.github/instructions/$(basename "$f")"
                desc=$(extract_description "$f")
                [ -z "$desc" ] && desc=$(extract_heading "$f")
                print_entry "[legacy-instr]" "$rel_f" "$desc"
            done << EOF
$(find -L "$instr_dir" -maxdepth 1 -name '*.instructions.md' | sort)
EOF
        fi
    fi

    # ---- .agents/rules/*.md (always-on rules), legacy .claude/rules ----
    rules_dir="$child_dir/.agents/rules"
    rules_label="[rule]"
    if [ ! -d "$rules_dir" ]; then
        rules_dir="$child_dir/.claude/rules"
        rules_label="[legacy-rule]"
    fi
    if [ -d "$rules_dir" ]; then
        rules_rel=".agents/rules"
        [ "$rules_label" = "[legacy-rule]" ] && rules_rel=".claude/rules"
        while IFS= read -r f; do
            [ -f "$f" ] || continue
            print_header
            rel_f="$child_label/$rules_rel/$(basename "$f")"
            desc=$(extract_description "$f")
            [ -z "$desc" ] && desc=$(extract_heading "$f")
            print_entry "$rules_label" "$rel_f" "$desc"
        done << EOF
$(find -L "$rules_dir" -maxdepth 1 -name '*.md' | sort)
EOF
    fi

    # ---- .agents/*.md reference docs (project-structure.md and friends) ----
    agents_dir="$child_dir/.agents"
    if [ -d "$agents_dir" ]; then
        while IFS= read -r f; do
            [ -f "$f" ] || continue
            print_header
            rel_f="$child_label/.agents/$(basename "$f")"
            desc=$(extract_description "$f")
            [ -z "$desc" ] && desc=$(extract_heading "$f")
            print_entry "[doc]" "$rel_f" "$desc"
        done << EOF
$(find -L "$agents_dir" -maxdepth 1 -name '*.md' | sort)
EOF
    fi

    # ---- Embedded copies: packages/*/agent-meta/ ----
    # Published packages may ship embedded agent-meta/ copies under packages/.
    # In a linked-monorepo context these are IGNORED — the root AGENTS.md and
    # .agents/ guidance listed above is authoritative.  Only count them; never
    # list individual paths so agents are not tempted to open them.
    pkg_dir="$child_dir/packages"
    if [ -d "$pkg_dir" ]; then
        embedded_count=$(find -L "$pkg_dir" -maxdepth 2 -name 'agent-meta' -type d 2>/dev/null | wc -l | tr -d ' ')
        if [ "$embedded_count" -gt 0 ]; then
            print_header
            printf '    %-16s %s\n' "[embedded]" "$embedded_count package(s) ship packages/*/agent-meta/ — IGNORED here"
            printf '                     -- linked context: root AGENTS.md and skills above are authoritative; embedded copies serve standalone npm consumers only\n'
        fi
    fi

    # ---- .agents/memory/MEMORY.md (index only; legacy .claude/memory fallback) ----
    mem_index="$child_dir/.agents/memory/MEMORY.md"
    if [ -f "$mem_index" ]; then
        print_header
        desc=$(extract_description "$mem_index")
        [ -z "$desc" ] && desc=$(extract_heading "$mem_index")
        print_entry "[memory-index]" "$child_label/.agents/memory/MEMORY.md" "$desc"
    else
        legacy_index="$child_dir/.claude/memory/MEMORY.md"
        if [ -f "$legacy_index" ]; then
            print_header
            desc=$(extract_description "$legacy_index")
            [ -z "$desc" ] && desc=$(extract_heading "$legacy_index")
            print_entry "[legacy-memory]" "$child_label/.claude/memory/MEMORY.md" "$desc"
            printf '                     -- legacy store: pending memory-recompact migration to .agents/memory/\n'
        fi
    fi

    if [ "$found_anything" -eq 0 ]; then
        : # nothing found — don't print a section header
    fi
}

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------

FILTER_PATH=""
FILTER_ROOT=""

while getopts ":p:r:h" opt; do
    case "$opt" in
        p) FILTER_PATH="$OPTARG" ;;
        r) FILTER_ROOT="$OPTARG" ;;
        h) usage ;;
        \?) echo "$SCRIPT_NAME: unknown option -$OPTARG" >&2; exit 1 ;;
        :)  echo "$SCRIPT_NAME: option -$OPTARG requires an argument" >&2; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Locate repo root — the nearest ancestor carrying AGENTS.md, falling back to
# the pre-migration sentinel (.github/copilot-instructions.md).
# ---------------------------------------------------------------------------

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=""
candidate="$SCRIPT_DIR"
while [ "$candidate" != "/" ]; do
    if [ -f "$candidate/AGENTS.md" ] || [ -f "$candidate/.github/copilot-instructions.md" ]; then
        REPO_ROOT="$candidate"
        break
    fi
    candidate=$(dirname "$candidate")
done

if [ -z "$REPO_ROOT" ]; then
    echo "$SCRIPT_NAME: could not locate repo root (no AGENTS.md found above $SCRIPT_DIR)" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Roots to scan
# ---------------------------------------------------------------------------

ALL_ROOTS="libraries apps"

if [ -n "$FILTER_PATH" ]; then
    # Scope to a single child (e.g. libraries/common)
    abs_child="$REPO_ROOT/$FILTER_PATH"
    if [ ! -d "$abs_child" ]; then
        echo "== $FILTER_PATH =="
        echo "    (directory not found — nothing to enumerate)"
        exit 0
    fi
    scan_child "$abs_child" "$FILTER_PATH"
    exit 0
fi

if [ -n "$FILTER_ROOT" ]; then
    ALL_ROOTS="$FILTER_ROOT"
fi

# ---------------------------------------------------------------------------
# Scan all roots
# ---------------------------------------------------------------------------

printed=0
for root_name in $ALL_ROOTS; do
    root_dir="$REPO_ROOT/$root_name"
    [ -d "$root_dir" ] || continue

    # Iterate direct children only (maxdepth 1, not the root itself).
    # -L follows symlinks so symlinked monorepos are entered.
    # We stop at the child level — find is not asked to recurse further.
    for child_dir in "$root_dir"/*/; do
        # Strip trailing slash
        child_dir="${child_dir%/}"
        [ -d "$child_dir" ] || continue

        child_name=$(basename "$child_dir")
        label="$root_name/$child_name"

        # Check the child actually carries agent guidance
        if [ -f "$child_dir/AGENTS.md" ] || [ -d "$child_dir/.agents" ] \
            || [ -d "$child_dir/.github" ] || [ -d "$child_dir/.claude" ]; then
            scan_child "$child_dir" "$label"
            printed=1
        fi
    done
done

if [ "$printed" -eq 0 ] && [ -z "$FILTER_PATH" ]; then
    echo "(no nested agent guidance found under: $ALL_ROOTS)"
fi

echo ""
