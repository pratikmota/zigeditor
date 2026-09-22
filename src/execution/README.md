# ZigEditor WASI host

Version-agnostic compile/run host. Artifact URLs come from the caller (`ZigEditor` `artifacts`, or `DEFAULT_ARTIFACT_BASE_URL`). This folder does not hardcode a Zig version.

The browser default is a classic worker at `dist/zig.worker.js`, started with `new URL("zig.worker.js", import.meta.url)`. Import `ZigWasiHost` from a client module only. The default mode requires `window` and `Worker`.

`ZigEditor` owns one `WasmAdapter` for the resolved artifact set and disposes it on unmount. There is no catalog singleton.

## API

```ts
const host = new ZigWasiHost(); // browser Worker (default)
const result = await host.run({
  code,
  artifacts: { moduleUrl, stdUrl, compilerRtUrl },
  loadTimeoutMs,    // optional; default 120s for fetch + tar unpack
  compileTimeoutMs, // optional; default 5s after WASI zig.wasm _start
  runTimeoutMs,     // optional; default 2s after guest program _start
});
host.dispose(); // worker.terminate(); drops queued jobs
```

`ZigEditor` passes `compileTimeoutMs` 60s, `runTimeoutMs` 2s, and `loadTimeoutMs` 120s. The host default compile budget stays 5s when the caller omits it.

Node proof only: `new ZigWasiHost({ mode: "in-process" })`. That path cannot abort a stuck WASI `_start`. Run it with `pnpm proof`.

`stdUrl` must be a tar (optionally gzip) of the compiler `lib/` tree, not a directory listing. The worker unpacks it into preopen `/lib` (cached by URL; each compile gets a cloned readonly tree).

## Guest argv and preopens

Compile:

```
zig.wasm build-exe main.zig -fno-llvm -fno-lld
# when compilerRtUrl is set:
libcompiler_rt.a -fno-compiler-rt -fno-entry
```

Empty env. Preopens:

| Guest path | Contents |
| --- | --- |
| `.` | in-memory `main.zig` (+ `libcompiler_rt.a`) |
| `/lib` | unpacked std archive |
| `/cache` | empty |

Do not pass `--zig-lib-dir /lib`. WASI `path_open` rejects absolute paths.

The HTTP artifact may be named `compiler_rt.a` or `libcompiler_rt.a`. The guest cwd always exposes it as `libcompiler_rt.a`.

A second WASI instance runs `main.wasm` with `.` empty, fds 0/1/2 as stdin plus captured stdout and stderr strings. Guest `sock_*` returns WASI `ENOTSUP`. No real FS, no env secrets.

## Timeouts vs fetch

| Stage | Clock starts | Default |
| --- | --- | --- |
| Load | worker `fetch` stage (HTTP + tar unpack) | 120s |
| Compile | WASI zig.wasm `_start` (after load) | 5s |
| Run | guest program `_start` | 2s |

WASI `_start` is synchronous. Aborting a stuck compile/run uses `worker.terminate()` (browser). In-process mode cannot kill mid-`_start`. Fetch uses `AbortSignal.timeout`.

## Caps (`wasm-limits.ts`)

| Cap | Default |
| --- | --- |
| Source | 64KB (reject before instantiate) |
| Artifact body (zig.wasm / std / crt) | 512MB |
| Load | 120s |
| Compile | 5s |
| Run | 2s |
| Captured stdout/stderr | truncate at 128KB |
| `WebAssembly.Memory` | abort if over 512MB |

## stderr vs stdout

Zig 0.16 `std.debug.print` writes stderr. Keep streams separate in `HostRunResult`. Hello World proofs accept the greeting in stdout or stderr.

## Proof

From the package root, with a local toolchain `dist/0.16.0` (default: the sibling ZigLab checkout):

```bash
pnpm proof
pnpm proof -- --dist /path/to/dist/0.16.0
```

The script tars `lib/` to `std.tar` beside that dist when missing or older than `lib/`, and serves artifacts on loopback. It does not copy files into an app `public/` folder. If `zig.wasm` is missing it prints `artifacts missing` and exits 0.
