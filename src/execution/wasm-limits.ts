/** Caps from requirement 12.2. Tunable; no Zig version literals. */

/** Reject source larger than this before instantiating zig.wasm. */
export const WASM_SOURCE_MAX_BYTES = 64 * 1024;

/** Compile-stage budget after artifacts are loaded (WASI zig.wasm _start). */
export const WASM_COMPILE_TIMEOUT_MS = 5_000;

/** Run-stage budget for the guest program WASI _start. */
export const WASM_RUN_TIMEOUT_MS = 2_000;

/**
 * Fetch + tar unpack only (not compile/run).
 * Hello World compile often needs a higher compileTimeoutMs than 5s; this budget is for load.
 */
export const WASM_LOAD_TIMEOUT_MS = 120_000;

/** Reject module / std / compiler_rt bodies larger than this before unpack. */
export const WASM_ARTIFACT_MAX_BYTES = 512 * 1024 * 1024;

/** Truncate captured stdout/stderr (64–256KB range). */
export const WASM_OUTPUT_MAX_BYTES = 128 * 1024;

/**
 * Abort if WebAssembly.Memory exceeds this.
 * zig.wasm is built with ~48MB stack; 512MB is a ceiling, not a typical size.
 */
export const WASM_MEMORY_MAX_BYTES = 512 * 1024 * 1024;

export function formatByteCap(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)}MB`;
  if (bytes % 1024 === 0) return `${bytes / 1024}KB`;
  return `${bytes} bytes`;
}
