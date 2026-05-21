#!/bin/sh
# nested-agent-context.sh
#
# Enumerate per-project .github and .claude guidance files from direct
# children of libraries/ and apps/ (one level deep only — no recursion
# into a linked monorepo's own libraries/).
#
# PURPOSE
#   Before editing anything inside libraries/ or apps/, agents MUST run
#   this script and read every listed file whose description matches the
#   planned change.
#
# USAGE
#   sh .github/agent-scripts/nested-agent-context.sh             # all roots
#   sh .github/agent-scripts/nested-agent-context.sh -p libraries/common
#   sh .github/agent-scripts/nested-agent-context.sh -r libraries
#   sh .github/agent-scripts/nested-agent-context.sh -h
#
# OPTIONS
#   -p <path>   Scope to a single child directory (e.g. libraries/common).
#               Must be a direct child of one of the scanned roots.
#   -r <root>   Scope to a single root directory name (e.g. libraries).
#   -h          Print this help text and exit.
#
# OUTPUT
#   For each child project that contains .github or .claude guidance:
#
#     == libraries/common ==
#     [copilot-instructions]  .github/copilot-instructions.md
#     [instruction]  .github/instructions/context.instructions.md
#                    -- How to use @owlmeans/context ...
#     [skill]  .claude/skills/context/SKILL.md
#              -- Context DI container skill
#     [rule]   .claude/rules/bun.md
#     [memory] .claude/memory/MEMORY.md  (index only)
#
# NOTES
#   - Symlinks are followed exactly one level; the child project's
#     own libraries/ subdirectory is never entered.
#   - Descriptions are extracted from YAML frontmatter (between the
#     first two '---' lines).  If absent, the first markdown heading
#     line is used.  Files are never sourced or eval'd.
#   - Exits 0 even when no files are found.
#
# SYNC NOTE
#   This script is duplicated verbatim in:
#     .claude/skills/nested-agent-context/scripts/nested-agent-context.sh
#   Both copies must be kept identical.

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
    label="$1"   # e.g. [instruction]
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

    # ---- .github/copilot-instructions.md ----
    ci="$child_dir/.github/copilot-instructions.md"
    if [ -f "$ci" ]; then
        print_header
        desc=$(extract_description "$ci")
        [ -z "$desc" ] && desc=$(extract_heading "$ci")
        print_entry "[copilot-instructions]" "$child_label/.github/copilot-instructions.md" "$desc"
    fi

    # ---- .github/instructions/*.instructions.md ----
    instr_dir="$child_dir/.github/instructions"
    if [ -d "$instr_dir" ]; then
        # Use find bounded to this directory only (maxdepth 1) so we
        # never descend into subdirectories or follow further symlinks.
        while IFS= read -r f; do
            [ -f "$f" ] || continue
            print_header
            rel_f="$child_label/.github/instructions/$(basename "$f")"
            desc=$(extract_description "$f")
            [ -z "$desc" ] && desc=$(extract_heading "$f")
            print_entry "[instruction]" "$rel_f" "$desc"
        done << EOF
$(find -L "$instr_dir" -maxdepth 1 -name '*.instructions.md' | sort)
EOF
    fi

    # ---- .claude/skills/*/SKILL.md ----
    skills_dir="$child_dir/.claude/skills"
    if [ -d "$skills_dir" ]; then
        while IFS= read -r f; do
            [ -f "$f" ] || continue
            print_header
            skill_name=$(basename "$(dirname "$f")")
            rel_f="$child_label/.claude/skills/$skill_name/SKILL.md"
            desc=$(extract_description "$f")
            [ -z "$desc" ] && desc=$(extract_heading "$f")
            print_entry "[skill]" "$rel_f" "$desc"
        done << EOF
$(find -L "$skills_dir" -maxdepth 2 -name 'SKILL.md' | sort)
EOF
    fi

    # ---- .claude/rules/*.md ----
    rules_dir="$child_dir/.claude/rules"
    if [ -d "$rules_dir" ]; then
        while IFS= read -r f; do
            [ -f "$f" ] || continue
            print_header
            rel_f="$child_label/.claude/rules/$(basename "$f")"
            desc=$(extract_description "$f")
            [ -z "$desc" ] && desc=$(extract_heading "$f")
            print_entry "[rule]" "$rel_f" "$desc"
        done << EOF
$(find -L "$rules_dir" -maxdepth 1 -name '*.md' | sort)
EOF
    fi

    # ---- .claude/memory/MEMORY.md (index only) ----
    mem_index="$child_dir/.claude/memory/MEMORY.md"
    if [ -f "$mem_index" ]; then
        print_header
        desc=$(extract_description "$mem_index")
        [ -z "$desc" ] && desc=$(extract_heading "$mem_index")
        print_entry "[memory-index]" "$child_label/.claude/memory/MEMORY.md" "$desc"
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
# Locate repo root (directory containing this script's .github parent)
# ---------------------------------------------------------------------------

# Walk up from the script location until we find a .github directory.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT="$SCRIPT_DIR"
while [ "$REPO_ROOT" != "/" ]; do
    if [ -d "$REPO_ROOT/.github" ] && [ -f "$REPO_ROOT/.github/copilot-instructions.md" ]; then
        break
    fi
    REPO_ROOT=$(dirname "$REPO_ROOT")
done

if [ ! -f "$REPO_ROOT/.github/copilot-instructions.md" ]; then
    echo "$SCRIPT_NAME: could not locate repo root" >&2
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

        # Skip if not a real directory or symlink-to-directory
        child_name=$(basename "$child_dir")
        label="$root_name/$child_name"

        # Check the child actually has any .github or .claude content
        if [ -d "$child_dir/.github" ] || [ -d "$child_dir/.claude" ]; then
            scan_child "$child_dir" "$label"
            printed=1
        fi
    done
done

if [ "$printed" -eq 0 ] && [ -z "$FILTER_PATH" ]; then
    echo "(no nested .github or .claude guidance found under: $ALL_ROOTS)"
fi

echo ""
