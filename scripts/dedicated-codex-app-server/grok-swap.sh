#!/usr/bin/env bash
set -euo pipefail
# Swap ~/.grok/bin/grok to a worktree-built binary; restore undoes it.
ACTION="${1:-status}"
GROK_BIN="${GROK_BIN_DIR:-$HOME/.grok/bin}/grok"
BACKUP="${GROK_BIN}.stock-backup"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lfg-grok-swap"
STATE_FILE="$STATE_DIR/active.json"
WORKTREE_BIN="${2:-}"

mkdir -p "$(dirname "$GROK_BIN")" "$STATE_DIR"

case "$ACTION" in
  status)
    if [[ -L "$GROK_BIN" || -f "$GROK_BIN" ]]; then
      echo "grok=$GROK_BIN"
      ls -la "$GROK_BIN" || true
      if command -v readlink >/dev/null; then readlink "$GROK_BIN" 2>/dev/null || true; fi
    fi
    [[ -f "$STATE_FILE" ]] && cat "$STATE_FILE" || echo "no swap state"
    ;;
  swap)
    if [[ -z "$WORKTREE_BIN" || ! -x "$WORKTREE_BIN" ]]; then
      echo "usage: grok-swap.sh swap /path/to/worktree/grok-or-xai-grok-pager" >&2
      exit 2
    fi
    if [[ ! -e "$BACKUP" && -e "$GROK_BIN" ]]; then
      cp -p "$GROK_BIN" "$BACKUP" 2>/dev/null || cp -a "$GROK_BIN" "$BACKUP"
      # if symlink, record target
      if [[ -L "$GROK_BIN" ]]; then
        echo "$(readlink "$GROK_BIN")" >"$STATE_DIR/prev-target.txt"
      fi
    fi
    ln -sfn "$WORKTREE_BIN" "$GROK_BIN"
    printf '%s\n' "{\"swappedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"worktreeBin\":\"$WORKTREE_BIN\",\"backup\":\"$BACKUP\"}" >"$STATE_FILE"
    echo "swapped -> $WORKTREE_BIN"
    ls -la "$GROK_BIN"
    ;;
  restore)
    if [[ -f "$STATE_DIR/prev-target.txt" ]]; then
      prev="$(cat "$STATE_DIR/prev-target.txt")"
      ln -sfn "$prev" "$GROK_BIN"
      rm -f "$STATE_DIR/prev-target.txt" "$STATE_FILE"
      echo "restored symlink -> $prev"
    elif [[ -e "$BACKUP" ]]; then
      rm -f "$GROK_BIN"
      mv "$BACKUP" "$GROK_BIN"
      rm -f "$STATE_FILE"
      echo "restored from backup $BACKUP"
    else
      echo "nothing to restore" >&2
      exit 1
    fi
    ls -la "$GROK_BIN"
    ;;
  *) echo "usage: grok-swap.sh status|swap <bin>|restore" >&2; exit 2 ;;
esac
