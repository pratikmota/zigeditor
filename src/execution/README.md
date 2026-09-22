# Execution

Phase 2 runs code through the mock preview adapter only.

Phase 3 adds the WASI host. The package build must emit `dist/zig.worker.js` and start it with `new URL("./zig.worker.js", import.meta.url)` so Vite and Next.js can load the worker from the published package. Do not expect the host app to copy a worker into its own source tree.
