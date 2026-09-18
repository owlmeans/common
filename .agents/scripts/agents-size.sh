#!/bin/sh
# agents-size.sh
#
# Measure what every agent session loads before any skill: AGENTS.md, every
# file it pulls in through a whole-line `@path` import (recursively), and the
# memory index .agents/memory/MEMORY.md, which the Memory protocol reads at
# session start.  Fails when the total exceeds the budget, or when a line of
# the skills index is long enough to be a paraphrase of the skill it names.
#
# USAGE
#   sh .agents/scripts/agents-size.sh            # from the repository root
#   AGENTS_BUDGET=40000 INDEX_LINE_MAX=160 sh .agents/scripts/agents-size.sh
#
# EXIT  0 within budget, 1 over budget or an over-long index line, 2 no AGENTS.md

set -eu

BUDGET="${AGENTS_BUDGET:-40000}"
LINE_MAX="${INDEX_LINE_MAX:-160}"
ROOT="$(pwd)"

[ -f "$ROOT/AGENTS.md" ] || { echo "agents-size: no AGENTS.md in $ROOT" >&2; exit 2; }

SEEN=""
TOTAL=0
status=0

add() {
  file="$1"
  case " $SEEN " in *" $file "*) return 0 ;; esac
  [ -f "$file" ] || { echo "agents-size: missing import $file" >&2; status=1; return 0; }
  SEEN="$SEEN $file"
  size=$(wc -c < "$file" | tr -d ' ')
  TOTAL=$((TOTAL + size))
  printf '%8s  %s\n' "$size" "${file#"$ROOT"/}"
  # whole-line @imports only, fenced code blocks skipped; resolved to absolute
  # paths BEFORE recursing, since POSIX sh has no local variables
  imports=$(cd "$(dirname "$file")" && awk '/^```/{f=!f; next} !f && /^@[^ ]+[ \t]*$/{sub(/^@/,""); sub(/[ \t]+$/,""); print}' "$(basename "$file")" |
    while IFS= read -r rel; do
      d=$(cd "$(dirname "$rel")" 2>/dev/null && pwd) || d="$(pwd)/$(dirname "$rel")"
      echo "$d/$(basename "$rel")"
    done)
  for imp in $imports; do
    add "$imp"
  done
}

echo "   chars  file"
add "$ROOT/AGENTS.md"
[ -f "$ROOT/.agents/memory/MEMORY.md" ] && add "$ROOT/.agents/memory/MEMORY.md"
printf '%8s  TOTAL (budget %s)\n' "$TOTAL" "$BUDGET"

if [ "$TOTAL" -gt "$BUDGET" ]; then
  echo "agents-size: over budget by $((TOTAL - BUDGET)) chars — move subsystem detail into its skill" >&2
  status=1
fi

long=$(awk -v max="$LINE_MAX" '
  /^```/ { f = !f; next }
  f { next }
  /^## / { skills = ($0 ~ /^## Skills/) ; next }
  skills && length($0) > max { printf "  AGENTS.md:%d (%d chars)\n", NR, length($0) }
' "$ROOT/AGENTS.md")
if [ -n "$long" ]; then
  echo "agents-size: skills-index lines over $LINE_MAX chars (one line per skill: /name — when to load):" >&2
  echo "$long" >&2
  status=1
fi

exit $status
