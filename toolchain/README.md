# ZigEditor WASM toolchain

Build-machine tools. Not part of the npm package. Do not import this folder from `src/`. macOS/Linux (`sh`, `rsync`, `patch`, `curl`).

Cross-compiles official Zig (pin in [`VERSION`](VERSION)) to `wasm32-wasi`. App authors who want to rebuild artifacts clone this repository. `pnpm pack` does not include `build.zig` or the build products.

## How the build works

```
VERSION pin
  → fetch-source.sh
  → prepare-source.sh
  → zig build --release=small
  → pnpm proof
  → publish directory
```

| Path | Git | What |
| --- | --- | --- |
| `VERSION` | commit | version, URL, sha256, minisig |
| `patches/` | commit | tiny WASI diffs |
| `.cache/zig-{ver}/` | ignore | unmodified official extract (and tarball) |
| `.vendor/zig-{ver}/` | ignore | patched tree used to compile `zig.wasm` |
| `dist/{ver}/` | ignore | `zig.wasm` + `lib/` + `libcompiler_rt.a` + `LICENSE` |
| `publish/{ver}/` | ignore | files a CDN or an app uploads |

`zig build --release=small` runs fetch before compile. If `.cache/zig-{ver}/src/main.zig` already exists, nothing is downloaded.

Host Zig on `PATH` must match `host Zig` in `VERSION` (native OS binary from [ziglang.org/download](https://ziglang.org/download/), not wasm). Network is required only for the first official tarball fetch. Patches apply only when the filename matches `zig-{version}-*.patch`.

Nested flags stay: `-Dtarget=wasm32-wasi --release=small -Ddev=wasm -Dno-lib -Dversion-string={ver}`.

- `-Ddev=wasm` — reduced feature set (wasm backend). The devenv patch also enables `legalize` and drops `stdio_listen` / `incremental`.
- `-Dno-lib` — std is copied into `dist/`, not embedded in `zig.wasm`.
- Threaded IO (default). `-Dio-mode=evented` does not compile on WASI.

Override extract path: `zig build -Dzig-source=/abs/path` (still must be official source for that version). Do not point `-Dzig-source` at a `zig-bootstrap` tarball.

## Reproduce

```bash
cd toolchain
zig version          # must match VERSION host Zig
zig build --release=small
cd ..
pnpm proof
sh toolchain/publish-public.sh
```

Disk: source extract about 280MB, vendor copy about 280MB, `dist/` about 243MB. Compile of `zig.wasm` is about 35–50s after the one-time copy.

`dist/{version}/`:

| Artifact | Typical size |
| --- | --- |
| `zig.wasm` | about 3.8MB |
| `lib/` | about 239MB |
| `libcompiler_rt.a` | about 165KB |
| `LICENSE` | Zig MIT, copied from official source |

## Proof

[`proof/host-proof.mjs`](../proof/host-proof.mjs) is the only proof script. From the package root, `pnpm proof` serves `toolchain/dist/0.16.0` on loopback and checks Hello World, a syntax error, an oversized source, and format. Pass `--dist` to point somewhere else.

## Publish directory

```bash
sh toolchain/publish-public.sh
```

Writes `toolchain/publish/{ver}/`:

```
publish/0.16.0/
  zig.wasm
  std.tar.gz
  compiler_rt.a
  LICENSE
  NOTICE
```

`std.tar.gz` is `tar -C dist/{ver}/lib -czf std.tar.gz .`, skipped when the archive is newer than `lib/`. This folder is the unit a CDN or an app uploads. The gzip tar is what browsers fetch. Unpacked `lib/` stays on the build machine.

URL contract, for base `https://cdn.example.com/zig/0.16.0`:

- `{base}/zig.wasm`
- `{base}/std.tar.gz`
- `{base}/compiler_rt.a`

`LICENSE` and `NOTICE` sit beside them and are not fetched by the host. The browser fetches the three files from the worker, so a cross-origin host must send `Access-Control-Allow-Origin`. Versioned paths are immutable; use a long cache lifetime.

Copy `publish/0.16.0` to `examples/vite/public/wasm/0.16.0` to compile Hello World in the Vite demo. With that folder absent, the demo uses the mock runner.

## License

- Toolchain scripts: MIT ([repository LICENSE](../LICENSE)).
- Official Zig source, `zig.wasm`, `lib/`, and `compiler_rt`: MIT. Keep [NOTICE](NOTICE) and `publish/{ver}/LICENSE` with any redistributed artifacts.
- `@bjorn3/browser_wasi_shim`: MIT OR Apache-2.0.
- Not affiliated with the Zig Software Foundation.
