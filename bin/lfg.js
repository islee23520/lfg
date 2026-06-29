#!/bin/sh
set -eu

target=$0
while [ -L "$target" ]; do
  target_dir=$(CDPATH= cd -- "$(dirname -- "$target")" && pwd)
  link=$(readlink "$target")
  case "$link" in
    /*) target=$link ;;
    *) target=$target_dir/$link ;;
  esac
done

script_dir=$(CDPATH= cd -- "$(dirname -- "$target")" && pwd)

if [ -f "$script_dir/../dist/lfg.js" ]; then
  exec node "$script_dir/../dist/lfg.js" "$@"
fi

if [ -f "$script_dir/../@islee23520/lfg/dist/lfg.js" ]; then
  exec node "$script_dir/../@islee23520/lfg/dist/lfg.js" "$@"
fi

echo "lfg has not been built yet. Run npm run build first." >&2
exit 1
