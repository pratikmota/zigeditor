#!/bin/sh
# Populate gitignored .cache/zig-{version}/ with unmodified official Zig source.
# Skip download when the extract already exists. macOS/Linux.
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
VERSION_FILE="$ROOT/VERSION"

version_value() {
  key="$1"
  val="$(sed -n "s/^${key}=//p" "$VERSION_FILE" | tr -d '\r' | head -n 1)"
  if [ -z "$val" ]; then
    echo "error: missing $key in $VERSION_FILE" >&2
    exit 1
  fi
  printf '%s' "$val"
}

ZIG_VERSION="$(version_value zigVersion)"
HOST_ZIG="$(version_value hostZig)"
SOURCE_URL="$(version_value sourceUrl)"
SOURCE_MINISIG_URL="$(version_value sourceMinisigUrl)"
SOURCE_SHA256="$(version_value sourceSha256)"
MINISIGN_PUB="$(version_value minisignPublicKey)"

CACHE_DIR="$ROOT/.cache"
EXTRACT_DIR="$CACHE_DIR/zig-$ZIG_VERSION" # new VERSION => new folder; 0.16 cache is left alone
TARBALL="$CACHE_DIR/zig-$ZIG_VERSION.tar.xz"
MINISIG="$TARBALL.minisig"
SIBLING="$ROOT/../../../ziglang-source/zig-$ZIG_VERSION" # optional leftover unpack outside this repo

if ! command -v zig >/dev/null 2>&1; then
  echo "error: host Zig $HOST_ZIG is required on PATH (native binary, not wasm)." >&2
  exit 1
fi
GOT_ZIG="$(zig version | tr -d '\r')"
if [ "$GOT_ZIG" != "$HOST_ZIG" ]; then
  echo "error: host zig version is $GOT_ZIG, expected $HOST_ZIG (see VERSION)." >&2
  exit 1
fi

# Reuse extract when present so zig build does not hit ziglang.org again.
if [ -f "$EXTRACT_DIR/src/main.zig" ]; then
  echo "using cached Zig $ZIG_VERSION source at $EXTRACT_DIR"
  exit 0
fi

mkdir -p "$CACHE_DIR"

file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

verify_tarball() {
  actual="$(file_sha256 "$TARBALL")"
  if [ "$actual" != "$SOURCE_SHA256" ]; then
    echo "error: sha256 mismatch for $TARBALL" >&2
    echo "  expected $SOURCE_SHA256" >&2
    echo "  got      $actual" >&2
    exit 1
  fi
  if command -v minisign >/dev/null 2>&1 && [ -f "$MINISIG" ]; then
    minisign -Vm "$TARBALL" -P "$MINISIGN_PUB"
  elif command -v minisign >/dev/null 2>&1; then
    echo "note: minisign is installed but $MINISIG is missing; sha256 only." >&2
  else
    echo "note: minisign not on PATH; verified sha256 only."
  fi
}

place_extract() {
  src_tree="$1"
  rm -rf "$EXTRACT_DIR"
  mkdir -p "$EXTRACT_DIR"
  rsync -a --delete --exclude zig-out --exclude .zig-cache "$src_tree/" "$EXTRACT_DIR/"
}

# Prefer a local sibling copy over a fresh download (same version only).
if [ -f "$SIBLING/src/main.zig" ]; then
  echo "copying existing sibling source $SIBLING into $EXTRACT_DIR"
  place_extract "$SIBLING"
  echo "using cached Zig $ZIG_VERSION source at $EXTRACT_DIR"
  exit 0
fi

if [ ! -f "$TARBALL" ]; then
  echo "downloading $SOURCE_URL"
  curl -L --fail --retry 3 -o "$TARBALL" "$SOURCE_URL"
fi
# Minisign is optional; sha256 below is the required check.
if [ ! -f "$MINISIG" ]; then
  curl -L --fail --retry 3 -o "$MINISIG" "$SOURCE_MINISIG_URL" || rm -f "$MINISIG"
fi

verify_tarball

TMP="$(mktemp -d "${TMPDIR:-/tmp}/ziglab-zig-src.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "extracting $TARBALL"
tar -xJf "$TARBALL" -C "$TMP"
# Official tarball wraps files in one top-level zig-{ver}/ directory.
INNER="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [ -z "$INNER" ] || [ ! -f "$INNER/src/main.zig" ]; then
  echo "error: tarball did not contain src/main.zig" >&2
  ls -la "$TMP" >&2
  exit 1
fi
place_extract "$INNER"
echo "using cached Zig $ZIG_VERSION source at $EXTRACT_DIR"
