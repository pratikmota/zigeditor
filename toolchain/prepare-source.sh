#!/bin/sh
# Copy official Zig source to a gitignored vendor dir and apply WASI compile patches.
# Does not modify the cached tarball extract. macOS/Linux.
set -euo pipefail

SRC="${1:?source dir}"
VENDOR="${2:?vendor dir}"
PATCH_DIR="${3:?patch directory}"
ZIG_VERSION="${4:?zig version}"

if [ ! -f "$SRC/src/main.zig" ]; then
  echo "error: Zig $ZIG_VERSION source not found at $SRC" >&2
  echo "Run zig build from tools/zig-wasm so fetch-source.sh can populate .cache/." >&2
  exit 1
fi

# Recopy vendor when stamps are missing or a matching patch file is newer.
need_copy=0
if [ ! -f "$VENDOR/.ziglab-patched" ]; then
  need_copy=1
fi
for p in "$PATCH_DIR"/zig-"$ZIG_VERSION"-*.patch; do
  [ -f "$p" ] || continue
  stamp="$VENDOR/.ziglab-$(basename "$p")"
  if [ ! -f "$stamp" ] || [ "$p" -nt "$stamp" ]; then
    need_copy=1
  fi
done

if [ "$need_copy" = 1 ]; then
  echo "copying official Zig $ZIG_VERSION source into .vendor (gitignored)..."
  mkdir -p "$VENDOR"
  # Copy from .cache extract; patches apply only to this vendor tree.
  rsync -a --delete --exclude zig-out --exclude .zig-cache --exclude '.ziglab-*' "$SRC/" "$VENDOR/"
  rm -f "$VENDOR"/.ziglab-*
fi

for p in "$PATCH_DIR"/zig-"$ZIG_VERSION"-*.patch; do
  [ -f "$p" ] || continue
  stamp="$VENDOR/.ziglab-$(basename "$p")"
  if [ ! -f "$stamp" ]; then
    echo "applying $(basename "$p")..."
    patch -p1 -d "$VENDOR" < "$p"
    date > "$stamp"
  fi
done
date > "$VENDOR/.ziglab-patched"
