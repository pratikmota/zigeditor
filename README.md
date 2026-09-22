# ZigEditor

React component that edits Zig and runs it in the browser. The npm package ships the editor, the WASI host, and the worker. It does not ship `zig.wasm` or the standard library.

React and Next.js only. Render it from a client component. The worker is inside the package.

## Install

```bash
pnpm add zigeditor
```

Peer dependency: React 19.

```tsx
"use client";

import { useState } from "react";
import { HELLO_ZIG_SOURCE, ZigEditor } from "zigeditor";
import "zigeditor/styles.css";

export function Editor() {
  const [code, setCode] = useState(HELLO_ZIG_SOURCE);
  return (
    <ZigEditor
      value={code}
      onChange={setCode}
      artifacts={{
        moduleUrl: "/wasm/0.16.0/zig.wasm",
        stdUrl: "/wasm/0.16.0/std.tar.gz",
        compilerRtUrl: "/wasm/0.16.0/compiler_rt.a",
      }}
    />
  );
}
```

Import `zigeditor/styles.css` once. Hosts can override any `--ze-*` variable on `.zig-editor`.

## Compiler files

Two ways to point at a compiler:

1. Pass `artifacts` with `moduleUrl`, `stdUrl`, and `compilerRtUrl`, as above. Same-origin hosting needs no CORS. ZigLab will use its own `/wasm/0.16.0/...` URLs and ignore the package default.
2. Omit `artifacts`. The package then uses `DEFAULT_ARTIFACT_BASE_URL` in `src/default-artifacts.ts`. That constant is an empty string until a real host exists, so callers must pass `artifacts`. When a CDN is live, set the constant to the version directory (trailing slash optional), rebuild, and publish the npm package:

```ts
export const DEFAULT_ARTIFACT_BASE_URL = "https://cdn.example.com/zig/0.16.0";
```

The base expands to `{base}/zig.wasm`, `{base}/std.tar.gz`, and `{base}/compiler_rt.a`. `LICENSE` and `NOTICE` sit beside those files for people and are not fetched by the host.

If the files are missing or the load fails, the editor uses the mock preview runner. Run results then have `preview: true`.

The browser fetches artifacts with `fetch` from the worker. A cross-origin CDN must send `Access-Control-Allow-Origin` for the app origins you care about, or `*`. Paths include the version directory (`/0.16.0/zig.wasm`), so a new Zig version is a new path. Those immutable files can use a long cache lifetime (`Cache-Control: public, max-age=31536000, immutable`).

Building the files is a maintainer task. Clone this repo and follow [toolchain/README.md](toolchain/README.md). The npm tarball does not contain `build.zig`.

## Caps

- Source larger than 64KB is rejected before `zig.wasm` starts.
- Default budgets: load 120s, compile 60s, run 2s. Pass `loadTimeoutMs`, `compileTimeoutMs`, or `runTimeoutMs` to change them.
- Guest code has no network.
