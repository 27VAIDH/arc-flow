#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
# Usage: ./ralph.sh [--tool amp|claude] [max_iterations]
#
# Improvements included:
# - macOS-friendly timeout (uses timeout or gtimeout, optional)
# - seconds-based ITER_TIMEOUT default (portable)
# - rate-limit detection ("You've hit your limit") => exits early (no wasted iterations)
# - safe piping to tee (won't trip pipefail/ERR trap)
# - completion detection via token, output text, OR prd.json having no passes:false
# - per-run logs under ./runs/<timestamp>/ and progress.txt

set -Eeuo pipefail
trap 'echo "❌ Error on line $LINENO. Last command: $BASH_COMMAND" >&2' ERR

# -----------------------------
# Defaults
# -----------------------------
TOOL="${TOOL:-claude}"                 # Default to claude
MAX_ITERATIONS=5
ITER_TIMEOUT="${ITER_TIMEOUT:-1200}"   # 20 minutes (seconds). Set to "0" to disable.
SLEEP_SECS="${SLEEP_SECS:-2}"
NO_PROGRESS_LIMIT="${NO_PROGRESS_LIMIT:-3}"  # stop after N iterations with no story completion

# -----------------------------
# Parse arguments
# -----------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="${2:-}"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

# -----------------------------
# Validate tool choice
# -----------------------------
if [[ "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp' or 'claude'." >&2
  exit 1
fi

# -----------------------------
# Paths
# -----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"
STOP_FILE="$SCRIPT_DIR/.stop-ralph"

RUN_ID="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$SCRIPT_DIR/runs/$RUN_ID"

# -----------------------------
# Helpers
# -----------------------------
need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Error: missing dependency: $1" >&2; exit 1; }
}

# Timeout is optional. On macOS, GNU timeout may be `gtimeout` (coreutils).
TIMEOUT_BIN=""
if [[ "${ITER_TIMEOUT}" != "0" && -n "${ITER_TIMEOUT}" ]]; then
  if command -v timeout >/dev/null 2>&1; then
    TIMEOUT_BIN="timeout"
  elif command -v gtimeout >/dev/null 2>&1; then
    TIMEOUT_BIN="gtimeout"
  else
    echo "⚠️  timeout not found (macOS usually lacks it). Disabling per-iteration timeout." >&2
    ITER_TIMEOUT="0"
  fi
fi

run_with_timeout() {
  if [[ "${ITER_TIMEOUT}" == "0" || -z "${ITER_TIMEOUT}" || -z "${TIMEOUT_BIN}" ]]; then
    "$@"
    return
  fi

  # Try timeout; if it fails (unsupported behavior), fall back to running without timeout.
  "$TIMEOUT_BIN" "${ITER_TIMEOUT}" "$@" || {
    echo "⚠️  ${TIMEOUT_BIN} failed with ITER_TIMEOUT='${ITER_TIMEOUT}'. Running without timeout." >&2
    "$@"
  }
}

# -----------------------------
# Dependency checks
# -----------------------------
need_cmd jq
need_cmd tee
need_cmd grep
need_cmd date
need_cmd sed
need_cmd mkdir
need_cmd cp
need_cmd cat

if [[ "$TOOL" == "amp" ]]; then
  need_cmd amp
else
  need_cmd claude
fi

# -----------------------------
# Prompt file checks
# -----------------------------
if [[ "$TOOL" == "claude" && ! -f "$SCRIPT_DIR/CLAUDE.md" ]]; then
  echo "Error: CLAUDE.md not found in $SCRIPT_DIR" >&2
  exit 1
fi

if [[ "$TOOL" == "amp" && ! -f "$SCRIPT_DIR/prompt.md" ]]; then
  echo "Error: prompt.md not found in $SCRIPT_DIR" >&2
  exit 1
fi

# -----------------------------
# Ensure folders/files exist
# -----------------------------
mkdir -p "$ARCHIVE_DIR"
mkdir -p "$SCRIPT_DIR/runs"
mkdir -p "$RUN_DIR"

if [[ ! -f "$PROGRESS_FILE" ]]; then
  {
    echo "# Ralph Progress Log"
    echo "Started: $(date)"
    echo "---"
  } > "$PROGRESS_FILE"
fi

echo "Starting Ralph - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"
echo "Run dir: $RUN_DIR"
echo "Stop file: $STOP_FILE (touch to stop)"
echo "Iter timeout: $ITER_TIMEOUT (bin: ${TIMEOUT_BIN:-none})"

# -----------------------------
# Archive previous run if branch changed
# -----------------------------
if [[ -f "$PRD_FILE" && -f "$LAST_BRANCH_FILE" ]]; then
  CURRENT_BRANCH="$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")"
  LAST_BRANCH="$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")"

  if [[ -n "$CURRENT_BRANCH" && -n "$LAST_BRANCH" && "$CURRENT_BRANCH" != "$LAST_BRANCH" ]]; then
    DATE_STR="$(date +%Y-%m-%d)"
    FOLDER_NAME="$(echo "$LAST_BRANCH" | sed 's|^ralph/||')"
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE_STR-$FOLDER_NAME"

    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [[ -f "$PRD_FILE" ]] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/" || true
    [[ -f "$PROGRESS_FILE" ]] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/" || true
    echo "   Archived to: $ARCHIVE_FOLDER"

    {
      echo "# Ralph Progress Log"
      echo "Started: $(date)"
      echo "---"
    } > "$PROGRESS_FILE"
  fi
fi

# Track current branch
if [[ -f "$PRD_FILE" ]]; then
  CURRENT_BRANCH="$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")"
  if [[ -n "$CURRENT_BRANCH" ]]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

# -----------------------------
# Main loop
# -----------------------------
FAILS=0
NO_PROGRESS=0

for i in $(seq 1 "$MAX_ITERATIONS"); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="

  if [[ -f "$STOP_FILE" ]]; then
    echo "🛑 Stop file found ($STOP_FILE). Exiting."
    exit 0
  fi

  ITER_LOG="$RUN_DIR/iter-$i.log"
  OUTPUT=""

  # Run the selected tool (safe pipeline; won't trip pipefail/ERR trap)
  if [[ "$TOOL" == "amp" ]]; then
    set +e
    OUTPUT="$(
      ( run_with_timeout amp --dangerously-allow-all < "$SCRIPT_DIR/prompt.md" 2>&1 | tee "$ITER_LOG" ) || true
    )"
    set -e
  else
    set +e
    OUTPUT="$(
      ( run_with_timeout claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/CLAUDE.md" 2>&1 | tee "$ITER_LOG" ) || true
    )"
    set -e
  fi

  # Stop if tool is rate-limited (avoid burning iterations)
  if echo "$OUTPUT" | grep -qi "You've hit your limit"; then
    echo "🛑 Tool rate limit hit. Exiting to avoid wasting iterations."
    echo "See: $ITER_LOG"
    exit 3
  fi

  # Progress log (tail last 120 lines)
  {
    echo ""
    echo "## Iteration $i - $(date)"
    echo "Tool: $TOOL"
    echo "Log: $ITER_LOG"
    echo "---"
    echo "$OUTPUT" | tail -n 120
    echo "---"
  } >> "$PROGRESS_FILE"

  # Print what got completed (nice UX)
  # Match multiple completion patterns:
  # 1. "completed **US-XXX**" or "successfully completed US-XXX"
  # 2. "US-XXX: Title ✅" or "US-XXX - Title ✅"
  # 3. "Summary - US-XXX" or "## Summary - US-XXX"
  # 4. "US-XXX complete" (original format)
  COMPLETED_LINE="$(echo "$OUTPUT" | grep -Eoi '(completed|summary).*US-[0-9]{3}|US-[0-9]{3}.*[✅]|US-[0-9]{3}.*[Cc]omplete' | grep -Eoi 'US-[0-9]{3}' | tail -n 1 || true)"
  if [[ -n "$COMPLETED_LINE" ]]; then
    echo "✅ $COMPLETED_LINE"
    NO_PROGRESS=0
  else
    NO_PROGRESS=$((NO_PROGRESS + 1))
  fi

  # If no progress for N iterations, stop (prevents burning tokens/cycles)
  if (( NO_PROGRESS >= NO_PROGRESS_LIMIT )); then
    echo "⚠️  No story completed in $NO_PROGRESS_LIMIT consecutive iterations. Stopping."
    echo "Check logs in: $RUN_DIR"
    exit 2
  fi

  # Completion detection:
  # 1) Explicit token
  # 2) Claude says there are no remaining passes:false stories
  # 3) PRD file shows no passes:false (authoritative)
  DONE=0
  if echo "$OUTPUT" | grep -Eq "<promise>COMPLETE</promise>|RALPH_COMPLETE|TASKS_COMPLETE"; then
    DONE=1
  elif echo "$OUTPUT" | grep -Eqi "no (more|remaining) stor(ies|y).*(passes: false|passes=false)"; then
    DONE=1
  elif [[ -f "$PRD_FILE" ]] && ! jq -e '.. | objects | select(has("passes") and .passes == false)' "$PRD_FILE" >/dev/null 2>&1; then
    DONE=1
  fi

  if [[ "$DONE" -eq 1 ]]; then
    echo ""
    echo "✅ Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  # Backoff on repeated empty output
  if [[ -z "${OUTPUT//[[:space:]]/}" ]]; then
    FAILS=$((FAILS + 1))
  else
    FAILS=0
  fi

  echo "Iteration $i complete. Log: $ITER_LOG"
  if (( FAILS >= 3 )); then
    echo "⚠️  $FAILS consecutive empty outputs. Backing off 15s..."
    sleep 15
  else
    sleep "$SLEEP_SECS"
  fi
done

echo ""
echo "❌ Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
echo "Run logs in: $RUN_DIR"
exit 1
