#!/usr/bin/env sh
# Copy toolchain dist/{ver}/ into toolchain/publish/{ver}/.
# Does not commit binaries. Run from zigeditor: sh toolchain/publish-public.sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

zigVersion=
while IFS= read -r raw || [ -n "$raw" ]; do
  line=$(printf "%s" "$raw" | tr -d "\r")
  case "$line" in
    ""|\#*) continue ;;
  esac
  key=${line%%=*}
  val=${line#*=}
  if [ "$key" = "zigVersion" ]; then
    zigVersion=$val
  fi
done < "$here/VERSION"

if [ -z "$zigVersion" ]; then
  echo "VERSION is missing zigVersion" >&2
  exit 1
fi

dist="$here/dist/$zigVersion"
out="$here/publish/$zigVersion"

if [ ! -f "$dist/zig.wasm" ]; then
  echo "Missing $dist/zig.wasm. Run: cd toolchain && zig build --release=small" >&2
  exit 1
fi

crt=
if [ -f "$dist/libcompiler_rt.a" ]; then
  crt="$dist/libcompiler_rt.a"
elif [ -f "$dist/compiler_rt.a" ]; then
  crt="$dist/compiler_rt.a"
else
  echo "Missing compiler_rt in $dist" >&2
  exit 1
fi

if [ ! -d "$dist/lib" ]; then
  echo "Missing $dist/lib" >&2
  exit 1
fi

if [ ! -f "$dist/LICENSE" ]; then
  echo "Missing $dist/LICENSE" >&2
  exit 1
fi

if [ ! -f "$here/NOTICE" ]; then
  echo "Missing $here/NOTICE" >&2
  exit 1
fi

mkdir -p "$out"
cp "$dist/zig.wasm" "$out/zig.wasm"
cp "$crt" "$out/compiler_rt.a"
cp "$dist/LICENSE" "$out/LICENSE"
cp "$here/NOTICE" "$out/NOTICE"

std_out="$out/std.tar.gz"
need_tar=1
if [ -f "$std_out" ] && [ ! "$dist/lib" -nt "$std_out" ]; then
  need_tar=0
fi
if [ "$need_tar" -eq 1 ]; then
  echo "creating $std_out from lib/…" >&2
  tar -C "$dist/lib" -czf "$std_out" .
fi

echo "published $out" >&2
