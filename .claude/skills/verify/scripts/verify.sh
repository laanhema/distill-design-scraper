#!/usr/bin/env bash
# Lifecycle helper for driving Distill during verification.
#   verify.sh up                  start fixture server + `next dev` for this run
#   verify.sh doctor              read-only health check of the running instance
#   verify.sh drive <scenario> …  run a Playwright scenario (see drive.ts)
#   verify.sh down                stop only the processes this run started
# State lives in .verify/current.env; evidence in .verify/runs/<run-id>/ (kept by `down`).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SCRIPTS="$REPO/.claude/skills/verify/scripts"
STATE="$REPO/.verify/current.env"

die() { echo "verify: $*" >&2; exit 1; }

free_port() {
  node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
}

pgid_alive() { [ -n "${1:-}" ] && kill -0 -- "-$1" 2>/dev/null; }

# Any next dev/start/server process whose cwd is this checkout, excluding our own group.
foreign_next() {
  local ours="${APP_PGID:-}"
  for pid in $(pgrep -f 'next(-server| dev| start)' || true); do
    [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$REPO" ] || continue
    [ -n "$ours" ] && [ "$(ps -o pgid= -p "$pid" | tr -d ' ')" = "$ours" ] && continue
    echo "$pid"
  done
}

load_state() {
  [ -f "$STATE" ] || die "no running instance (missing $STATE). Run: verify.sh up"
  # shellcheck disable=SC1090
  source "$STATE"
}

write_state() {
  cat >"$STATE" <<EOF
RUN_ID=$RUN_ID
RUN_DIR=$RUN_DIR
APP_PORT=$APP_PORT
APP_URL=http://127.0.0.1:$APP_PORT
APP_PGID=$APP_PGID
FIXTURE_PORT=$FIXTURE_PORT
FIXTURE_URL=http://127.0.0.1:$FIXTURE_PORT
FIXTURE_PGID=$FIXTURE_PGID
AI_LANE=$([ "${VERIFY_AI:-}" = "1" ] && echo on || echo off)
GIT_HEAD=$(git -C "$REPO" rev-parse --short HEAD)$(git -C "$REPO" diff --quiet HEAD -- . ':!.claude' ':!.gitignore' || echo -dirty)
EOF
}

cmd_up() {
  if [ -f "$STATE" ]; then
    # shellcheck disable=SC1090
    source "$STATE"
    if pgid_alive "${APP_PGID:-}" || pgid_alive "${FIXTURE_PGID:-}"; then
      die "an instance from run $RUN_ID is still up. Reuse it, or run: verify.sh down"
    fi
    rm -f "$STATE"
  fi
  local others; others="$(APP_PGID='' foreign_next)"
  [ -z "$others" ] || die "another Next.js process is running in this checkout (pid $others) and shares .next/. Refusing to start a second one; stop it or reuse it."

  RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
  RUN_DIR="$REPO/.verify/runs/$RUN_ID"
  mkdir -p "$RUN_DIR/logs" "$RUN_DIR/evidence"
  APP_PORT="${APP_PORT:-$(free_port)}"
  FIXTURE_PORT="${FIXTURE_PORT:-$(free_port)}"

  setsid node "$SCRIPTS/fixture-server.mjs" "$FIXTURE_PORT" "$REPO/eval/fixtures" \
    >"$RUN_DIR/logs/fixture.log" 2>&1 < /dev/null &
  FIXTURE_PGID="$!"
  APP_PGID=""
  write_state  # recorded before anything can fail, so `down` can always clean up

  # AI lane off by default: empty keys win over .env.local (Next never overrides
  # an env var that is already defined). VERIFY_AI=1 keeps the .env.local keys.
  local ai_env=(GEMINI_API_KEY= OPENROUTER_API_KEY=)
  [ "${VERIFY_AI:-}" = "1" ] && ai_env=()
  (cd "$REPO" && setsid env "${ai_env[@]}" \
      SSRF_ALLOWLIST_HOSTS=127.0.0.1 NEXT_TELEMETRY_DISABLED=1 \
      node_modules/.bin/next dev -p "$APP_PORT" -H 127.0.0.1 \
      >"$RUN_DIR/logs/next.log" 2>&1 < /dev/null) &
  for _ in $(seq 1 20); do
    APP_PGID="$(pgrep -f "next dev -p $APP_PORT" | head -1 | xargs -r ps -o pgid= -p | tr -d ' ')"
    [ -n "$APP_PGID" ] && break
    sleep 0.5
  done
  write_state
  [ -n "$APP_PGID" ] || die "next dev did not start; see $RUN_DIR/logs/next.log (run verify.sh down)"

  # First request triggers the page compile; poll until the shell answers.
  for _ in $(seq 1 120); do
    if curl -sf "http://127.0.0.1:$APP_PORT/" 2>/dev/null | grep -q '<h1[^>]*>Distill</h1>'; then
      echo "ready: app http://127.0.0.1:$APP_PORT  fixtures http://127.0.0.1:$FIXTURE_PORT  run $RUN_ID"
      return 0
    fi
    pgid_alive "$APP_PGID" || die "next dev exited; see $RUN_DIR/logs/next.log"
    sleep 1
  done
  die "app not ready after 120s; see $RUN_DIR/logs/next.log (run verify.sh down)"
}

cmd_doctor() {
  load_state
  local ok=1
  check() { if eval "$2"; then echo "ok    $1"; else echo "FAIL  $1"; ok=0; fi; }
  echo "run $RUN_ID  head $GIT_HEAD  ai-lane $AI_LANE"
  check "app process group $APP_PGID alive" "pgid_alive $APP_PGID"
  check "fixture process group $FIXTURE_PGID alive" "pgid_alive $FIXTURE_PGID"
  check "port $APP_PORT owned by our group" \
    "ss -ltnpH 'sport = :$APP_PORT' | grep -oP 'pid=\K[0-9]+' | xargs -r ps -o pgid= -p | tr -d ' ' | grep -qx $APP_PGID"
  check "GET $APP_URL/ renders the Distill shell" "curl -sf $APP_URL/ | grep -q '<h1[^>]*>Distill</h1>'"
  check "GET $FIXTURE_URL/clean-light.html serves the fixture" "curl -sf $FIXTURE_URL/clean-light.html | grep -q 'Clean Light'"
  check "POST /api/analyze answers 400 on empty body" \
    "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' $APP_URL/api/analyze)\" = 400 ]"
  local others; others="$(foreign_next)"
  check "no foreign Next.js process in this checkout" "[ -z '$others' ]"
  [ "$ok" = 1 ] || { echo "doctor: instance is NOT safe to drive; check $RUN_DIR/logs/" >&2; return 1; }
}

cmd_drive() {
  load_state
  local scenario="${1:-}"; [ -n "$scenario" ] || die "usage: verify.sh drive <scenario> [--flag value …]"
  shift
  local out; out="$RUN_DIR/evidence/$scenario-$(date +%H%M%S)"
  (cd "$REPO" && APP_URL="$APP_URL" FIXTURE_URL="$FIXTURE_URL" EVIDENCE_DIR="$out" AI_LANE="$AI_LANE" \
    node_modules/.bin/tsx "$SCRIPTS/drive.ts" "$scenario" "$@")
}

cmd_down() {
  [ -f "$STATE" ] || { echo "verify: nothing to stop"; return 0; }
  # shellcheck disable=SC1090
  source "$STATE"
  for g in "$APP_PGID" "$FIXTURE_PGID"; do
    pgid_alive "$g" && kill -TERM -- "-$g" 2>/dev/null || true
  done
  for _ in $(seq 1 20); do
    pgid_alive "$APP_PGID" || pgid_alive "$FIXTURE_PGID" || break
    sleep 0.5
  done
  for g in "$APP_PGID" "$FIXTURE_PGID"; do
    pgid_alive "$g" && kill -KILL -- "-$g" 2>/dev/null || true
  done
  rm -f "$STATE"
  echo "stopped run $RUN_ID; evidence kept at $RUN_DIR/evidence"
}

case "${1:-}" in
  up) cmd_up ;;
  doctor) cmd_doctor ;;
  drive) shift; cmd_drive "$@" ;;
  down) cmd_down ;;
  *) die "usage: verify.sh up|doctor|drive <scenario>|down" ;;
esac
