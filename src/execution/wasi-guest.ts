import {
  ConsoleStdout,
  File,
  OpenFile,
  PreopenDirectory,
  WASI,
  wasi,
} from "@bjorn3/browser_wasi_shim";
import type { Inode } from "@bjorn3/browser_wasi_shim";
import { cloneInodeTree, unpackStdArchive, wasmBytes } from "./wasi-tar";
import {
  WASM_ARTIFACT_MAX_BYTES,
  WASM_LOAD_TIMEOUT_MS,
  WASM_MEMORY_MAX_BYTES,
  WASM_OUTPUT_MAX_BYTES,
  WASM_SOURCE_MAX_BYTES,
  formatByteCap,
} from "./wasm-limits";

export type ZigWasmArtifacts = {
  moduleUrl: string;
  stdUrl: string;
  compilerRtUrl?: string;
};

export type LoadedZigArtifacts = {
  zigWasm: Uint8Array;
  stdArchive: Uint8Array;
  compilerRt?: Uint8Array;
};

export type HostRunRequest = {
  code: string;
  artifacts: ZigWasmArtifacts;
  compileTimeoutMs?: number;
  runTimeoutMs?: number;
  loadTimeoutMs?: number;
};

export type HostRunResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  errorKind?:
    | "source_too_large"
    | "compile_failed"
    | "format_failed"
    | "run_failed"
    | "timeout"
    | "unavailable"
    | "memory";
};

export type HostFormatResult = {
  ok: boolean;
  code: string;
  stderr: string;
  durationMs: number;
  errorKind?: HostRunResult["errorKind"];
};

export class WasiGuestError extends Error {
  readonly kind: NonNullable<HostRunResult["errorKind"]>;

  constructor(kind: NonNullable<HostRunResult["errorKind"]>, message: string) {
    super(message);
    this.kind = kind;
  }
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

function truncate(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= WASM_OUTPUT_MAX_BYTES) return text;
  return new TextDecoder().decode(bytes.subarray(0, WASM_OUTPUT_MAX_BYTES));
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.byteLength;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

function captureFd(): { fd: ConsoleStdout; text: () => string } {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const fd = new ConsoleStdout((buffer) => {
    total += buffer.byteLength;
    if (total <= WASM_OUTPUT_MAX_BYTES * 2) chunks.push(buffer.slice());
  });
  return {
    fd,
    text: () => truncate(new TextDecoder().decode(concatBytes(chunks))),
  };
}

const WASI_TOOLCHAIN_MISSING_START =
  "wasm module is missing WASI _start/memory";
const WASI_PROGRAM_MISSING_START =
  "error: compiled program has no WASI entry. Zig looks for pub fn main.";

function asWasiStart(
  instance: WebAssembly.Instance,
  role: "toolchain" | "program" = "toolchain",
): Parameters<WASI["start"]>[0] {
  const exports = instance.exports as {
    memory?: WebAssembly.Memory;
    _start?: () => unknown;
  };
  if (!(exports.memory instanceof WebAssembly.Memory) || typeof exports._start !== "function") {
    if (role === "program") {
      throw new WasiGuestError("run_failed", WASI_PROGRAM_MISSING_START);
    }
    throw new WasiGuestError("unavailable", WASI_TOOLCHAIN_MISSING_START);
  }
  return { exports: { memory: exports.memory, _start: exports._start } };
}

function assertMemory(instance: WebAssembly.Instance): void {
  const memory = instance.exports.memory;
  if (!(memory instanceof WebAssembly.Memory)) return;
  if (memory.buffer.byteLength > WASM_MEMORY_MAX_BYTES) {
    throw new WasiGuestError("memory", "guest WebAssembly memory exceeded the sandbox cap");
  }
}

/** Best-effort: JS Memory.grow. Wasm memory.grow opcode is still caught after _start. */
function installMemoryCap(instance: WebAssembly.Instance): void {
  const memory = instance.exports.memory;
  if (!(memory instanceof WebAssembly.Memory)) return;
  const grow = memory.grow.bind(memory);
  try {
    memory.grow = (delta: number) => {
      const next = memory.buffer.byteLength + delta * 65536;
      if (next > WASM_MEMORY_MAX_BYTES) {
        throw new WasiGuestError("memory", "guest WebAssembly memory exceeded the sandbox cap");
      }
      return grow(delta);
    };
  } catch {
    // exports.memory.grow may be non-writable
  }
  assertMemory(instance);
}

function guestWasiImport(instance: WASI): WebAssembly.Imports["wasi_snapshot_preview1"] {
  const denySock = () => wasi.ERRNO_NOTSUP;
  return {
    ...instance.wasiImport,
    sock_recv: denySock,
    sock_send: denySock,
    sock_shutdown: denySock,
    sock_accept: denySock,
  };
}

/** Instantiate zig.wasm with WASI imports. Does not call _start. */
export async function probeZigWasm(zigWasm: Uint8Array): Promise<void> {
  const probeWasi = new WASI(
    ["zig.wasm"],
    [],
    [
      new OpenFile(new File([])),
      new OpenFile(new File([])),
      new OpenFile(new File([])),
      new PreopenDirectory(".", new Map()),
      new PreopenDirectory("/lib", new Map()),
      new PreopenDirectory("/cache", new Map()),
    ],
    { debug: false },
  );
  try {
    const compiled = await WebAssembly.instantiate(wasmBytes(zigWasm), {
      wasi_snapshot_preview1: guestWasiImport(probeWasi),
    });
    asWasiStart(compiled.instance);
    installMemoryCap(compiled.instance);
  } catch (err) {
    if (err instanceof WasiGuestError) throw err;
    const message = err instanceof Error ? err.message : "instantiate failed";
    throw new WasiGuestError("unavailable", `zig.wasm instantiate failed: ${message}`);
  }
}

function asFile(inode: Inode | undefined): File | undefined {
  return inode instanceof File ? inode : undefined;
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

export function rejectOversizedSource(code: string): HostRunResult | null {
  if (utf8Bytes(code) <= WASM_SOURCE_MAX_BYTES) return null;
  return {
    ok: false,
    stdout: "",
    stderr: `Source is larger than the sandbox limit (${formatByteCap(WASM_SOURCE_MAX_BYTES)}). The compiler was not started.`,
    exitCode: null,
    durationMs: 0,
    errorKind: "source_too_large",
  };
}

export type FetchZigArtifactsOptions = {
  cache?: Map<string, Uint8Array>;
  signal?: AbortSignal;
};

export async function fetchZigArtifacts(
  artifacts: ZigWasmArtifacts,
  options: FetchZigArtifactsOptions = {},
): Promise<LoadedZigArtifacts> {
  async function load(url: string, label: string): Promise<Uint8Array> {
    const hit = options.cache?.get(url);
    if (hit) return hit;
    let res: Response;
    try {
      res = await fetch(url, { signal: options.signal });
    } catch (err) {
      if (options.signal?.aborted || isAbortError(err)) {
        throw new WasiGuestError("timeout", "timed out");
      }
      throw err;
    }
    if (!res.ok) {
      throw new WasiGuestError("unavailable", `failed to load ${label} (${res.status})`);
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > WASM_ARTIFACT_MAX_BYTES) {
      throw new WasiGuestError(
        "unavailable",
        `${label} exceeds the artifact size cap (${formatByteCap(WASM_ARTIFACT_MAX_BYTES)})`,
      );
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > WASM_ARTIFACT_MAX_BYTES) {
      throw new WasiGuestError(
        "unavailable",
        `${label} exceeds the artifact size cap (${formatByteCap(WASM_ARTIFACT_MAX_BYTES)})`,
      );
    }
    options.cache?.set(url, bytes);
    return bytes;
  }

  const [zigWasm, stdArchive, compilerRt] = await Promise.all([
    load(artifacts.moduleUrl, "zig.wasm"),
    load(artifacts.stdUrl, "std archive"),
    artifacts.compilerRtUrl
      ? load(artifacts.compilerRtUrl, "compiler_rt")
      : Promise.resolve(undefined),
  ]);
  return { zigWasm, stdArchive, compilerRt };
}

export async function unpackStdLib(stdArchive: Uint8Array): Promise<Map<string, Inode>> {
  return unpackStdArchive(stdArchive);
}

export { cloneInodeTree };

export type CompileOutcome =
  | { ok: true; wasm: Uint8Array; durationMs: number }
  | { ok: false; result: HostRunResult };

/** WASI zig.wasm: build-exe main.zig -fno-llvm -fno-lld (+ compiler_rt when provided). */
export async function compileZigSource(
  code: string,
  loaded: LoadedZigArtifacts,
  libTree: Map<string, Inode>,
): Promise<CompileOutcome> {
  const oversized = rejectOversizedSource(code);
  if (oversized) return { ok: false, result: oversized };

  const started = Date.now();
  const compileOut = captureFd();
  const compileErr = captureFd();
  const cwdEntries = new Map<string, Inode>([
    ["main.zig", new File(new TextEncoder().encode(code))],
  ]);
  const compileArgs = ["zig.wasm", "build-exe", "main.zig", "-fno-llvm", "-fno-lld"];
  if (loaded.compilerRt) {
    cwdEntries.set("libcompiler_rt.a", new File(loaded.compilerRt));
    compileArgs.push("libcompiler_rt.a", "-fno-compiler-rt", "-fno-entry");
  }

  // Empty env. Do not pass --zig-lib-dir /lib: WASI path_open rejects absolute paths.
  const compileWasi = new WASI(
    compileArgs,
    [],
    [
      new OpenFile(new File([])),
      compileOut.fd,
      compileErr.fd,
      new PreopenDirectory(".", cwdEntries),
      new PreopenDirectory("/lib", libTree),
      new PreopenDirectory("/cache", new Map()),
    ],
    { debug: false },
  );

  let instance: WebAssembly.Instance;
  try {
    const compiled = await WebAssembly.instantiate(wasmBytes(loaded.zigWasm), {
      wasi_snapshot_preview1: guestWasiImport(compileWasi),
    });
    instance = compiled.instance;
    installMemoryCap(instance);
  } catch (err) {
    if (err instanceof WasiGuestError) {
      return {
        ok: false,
        result: {
          ok: false,
          stdout: "",
          stderr: err.message,
          exitCode: null,
          durationMs: Date.now() - started,
          errorKind: err.kind,
        },
      };
    }
    const message = err instanceof Error ? err.message : "unavailable";
    return {
      ok: false,
      result: {
        ok: false,
        stdout: "",
        stderr: `unavailable: ${message}`,
        exitCode: null,
        durationMs: Date.now() - started,
        errorKind: "unavailable",
      },
    };
  }

  let compileExit = 0;
  try {
    compileExit = compileWasi.start(asWasiStart(instance));
    assertMemory(instance);
  } catch (err) {
    if (err instanceof WasiGuestError) {
      return {
        ok: false,
        result: {
          ok: false,
          stdout: compileOut.text(),
          stderr: truncate(`${compileErr.text()}\n${err.message}`.trim()),
          exitCode: null,
          durationMs: Date.now() - started,
          errorKind: err.kind,
        },
      };
    }
    const message = err instanceof Error ? err.message : "compile failed";
    return {
      ok: false,
      result: {
        ok: false,
        stdout: compileOut.text(),
        stderr: truncate(`${compileErr.text()}\n${message}`.trim()),
        exitCode: null,
        durationMs: Date.now() - started,
        errorKind: "compile_failed",
      },
    };
  }

  const compileLog = truncate(`${compileOut.text()}\n${compileErr.text()}`.trim());
  if (compileExit !== 0) {
    return {
      ok: false,
      result: {
        ok: false,
        stdout: compileOut.text(),
        stderr: compileLog || `compile failed: exit ${compileExit}`,
        exitCode: compileExit,
        durationMs: Date.now() - started,
        errorKind: "compile_failed",
      },
    };
  }

  const cwd = compileWasi.fds[3];
  if (!(cwd instanceof PreopenDirectory)) {
    return {
      ok: false,
      result: {
        ok: false,
        stdout: "",
        stderr: "unavailable: compile succeeded but the virtual cwd was missing",
        exitCode: compileExit,
        durationMs: Date.now() - started,
        errorKind: "unavailable",
      },
    };
  }
  const mainWasm = asFile(cwd.dir.contents.get("main.wasm"));
  if (!mainWasm) {
    return {
      ok: false,
      result: {
        ok: false,
        stdout: compileOut.text(),
        stderr: compileLog || "compile failed: main.wasm was not produced",
        exitCode: compileExit,
        durationMs: Date.now() - started,
        errorKind: "compile_failed",
      },
    };
  }

  return { ok: true, wasm: mainWasm.data, durationMs: Date.now() - started };
}

export type FormatOutcome =
  | { ok: true; code: string; durationMs: number }
  | { ok: false; result: HostRunResult };

/**
 * WASI zig.wasm: `fmt --stdin`.
 * In-place `fmt main.zig` uses atomic replace (rename), which the WASI shim
 * does not implement. Stdin/stdout is still real zig fmt.
 */
export async function formatZigSource(
  code: string,
  loaded: LoadedZigArtifacts,
): Promise<FormatOutcome> {
  const oversized = rejectOversizedSource(code);
  if (oversized) return { ok: false, result: oversized };

  const started = Date.now();
  const fmtOut = captureFd();
  const fmtErr = captureFd();

  const fmtWasi = new WASI(
    ["zig.wasm", "fmt", "--stdin"],
    [],
    [
      new OpenFile(new File(new TextEncoder().encode(code))),
      fmtOut.fd,
      fmtErr.fd,
      new PreopenDirectory(".", new Map()),
      new PreopenDirectory("/lib", new Map()),
      new PreopenDirectory("/cache", new Map()),
    ],
    { debug: false },
  );

  let instance: WebAssembly.Instance;
  try {
    const compiled = await WebAssembly.instantiate(wasmBytes(loaded.zigWasm), {
      wasi_snapshot_preview1: guestWasiImport(fmtWasi),
    });
    instance = compiled.instance;
    installMemoryCap(instance);
  } catch (err) {
    if (err instanceof WasiGuestError) {
      return {
        ok: false,
        result: {
          ok: false,
          stdout: "",
          stderr: err.message,
          exitCode: null,
          durationMs: Date.now() - started,
          errorKind: err.kind,
        },
      };
    }
    const message = err instanceof Error ? err.message : "unavailable";
    return {
      ok: false,
      result: {
        ok: false,
        stdout: "",
        stderr: `unavailable: ${message}`,
        exitCode: null,
        durationMs: Date.now() - started,
        errorKind: "unavailable",
      },
    };
  }

  let fmtExit = 0;
  try {
    fmtExit = fmtWasi.start(asWasiStart(instance));
    assertMemory(instance);
  } catch (err) {
    if (err instanceof WasiGuestError) {
      return {
        ok: false,
        result: {
          ok: false,
          stdout: fmtOut.text(),
          stderr: truncate(`${fmtErr.text()}\n${err.message}`.trim()),
          exitCode: null,
          durationMs: Date.now() - started,
          errorKind: err.kind,
        },
      };
    }
    const message = err instanceof Error ? err.message : "format failed";
    return {
      ok: false,
      result: {
        ok: false,
        stdout: fmtOut.text(),
        stderr: truncate(`${fmtErr.text()}\n${message}`.trim()),
        exitCode: null,
        durationMs: Date.now() - started,
        errorKind: "format_failed",
      },
    };
  }

  const formatted = fmtOut.text();
  if (fmtExit !== 0) {
    const fmtLog = truncate(`${formatted}\n${fmtErr.text()}`.trim());
    return {
      ok: false,
      result: {
        ok: false,
        stdout: formatted,
        stderr: fmtLog || `format failed: exit ${fmtExit}`,
        exitCode: fmtExit,
        durationMs: Date.now() - started,
        errorKind: "format_failed",
      },
    };
  }

  if (code.length > 0 && formatted.length === 0) {
    return {
      ok: false,
      result: {
        ok: false,
        stdout: "",
        stderr: truncate(fmtErr.text()) || "format failed: zig fmt produced no output",
        exitCode: fmtExit,
        durationMs: Date.now() - started,
        errorKind: "format_failed",
      },
    };
  }

  return {
    ok: true,
    code: formatted,
    durationMs: Date.now() - started,
  };
}

export async function runCompiledWasm(wasm: Uint8Array): Promise<HostRunResult> {
  const started = Date.now();
  const runOut = captureFd();
  const runErr = captureFd();
  const runWasi = new WASI(
    ["main.wasm"],
    [],
    [
      new OpenFile(new File([])),
      runOut.fd,
      runErr.fd,
      new PreopenDirectory(".", new Map()),
    ],
    { debug: false },
  );

  let instance: WebAssembly.Instance;
  try {
    const compiled = await WebAssembly.instantiate(wasmBytes(wasm), {
      wasi_snapshot_preview1: guestWasiImport(runWasi),
    });
    instance = compiled.instance;
    installMemoryCap(instance);
  } catch (err) {
    if (err instanceof WasiGuestError) {
      return {
        ok: false,
        stdout: "",
        stderr: err.message,
        exitCode: null,
        durationMs: Date.now() - started,
        errorKind: err.kind,
      };
    }
    const message = err instanceof Error ? err.message : "unavailable";
    return {
      ok: false,
      stdout: "",
      stderr: `unavailable: ${message}`,
      exitCode: null,
      durationMs: Date.now() - started,
      errorKind: "unavailable",
    };
  }

  let runExit = 0;
  try {
    runExit = runWasi.start(asWasiStart(instance, "program"));
    assertMemory(instance);
  } catch (err) {
    if (err instanceof WasiGuestError) {
      return {
        ok: false,
        stdout: runOut.text(),
        stderr: truncate(`${runErr.text()}\n${err.message}`.trim()),
        exitCode: null,
        durationMs: Date.now() - started,
        errorKind: err.kind,
      };
    }
    const message = err instanceof Error ? err.message : "run failed";
    return {
      ok: false,
      stdout: runOut.text(),
      stderr: truncate(`${runErr.text()}\n${message}`.trim()),
      exitCode: null,
      durationMs: Date.now() - started,
      errorKind: "run_failed",
    };
  }

  return {
    ok: runExit === 0,
    stdout: runOut.text(),
    stderr: runErr.text(),
    exitCode: runExit,
    durationMs: Date.now() - started,
    errorKind: runExit === 0 ? undefined : "run_failed",
  };
}

/** Fetch is the caller's job. Timeouts belong to the host (worker.terminate). */
export async function compileAndRunZig(
  code: string,
  loaded: LoadedZigArtifacts,
): Promise<HostRunResult> {
  const oversized = rejectOversizedSource(code);
  if (oversized) return oversized;

  const libTree = cloneInodeTree(await unpackStdLib(loaded.stdArchive));
  const compiled = await compileZigSource(code, loaded, libTree);
  if (!compiled.ok) return compiled.result;
  const ran = await runCompiledWasm(compiled.wasm);
  return { ...ran, durationMs: compiled.durationMs + ran.durationMs };
}

export function loadTimeoutSignal(loadTimeoutMs = WASM_LOAD_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(loadTimeoutMs);
}
