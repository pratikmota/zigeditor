import {
  cloneInodeTree,
  compileZigSource,
  fetchZigArtifacts,
  formatZigSource,
  loadTimeoutSignal,
  probeZigWasm,
  rejectOversizedSource,
  runCompiledWasm,
  unpackStdLib,
  WasiGuestError,
} from "./wasi-guest";
import type { HostFormatResult, HostRunRequest, HostRunResult } from "./wasi-guest";
import {
  WASM_COMPILE_TIMEOUT_MS,
  WASM_LOAD_TIMEOUT_MS,
  WASM_RUN_TIMEOUT_MS,
} from "./wasm-limits";
import type { ZigWorkerEvent, ZigWorkerRequest } from "./wasi-protocol";
import type { Inode } from "@bjorn3/browser_wasi_shim";

export type {
  HostFormatResult,
  HostRunRequest,
  HostRunResult,
  LoadedZigArtifacts,
  ZigWasmArtifacts,
} from "./wasi-guest";
export { rejectOversizedSource, WasiGuestError } from "./wasi-guest";

export type ZigWasiHostMode = "worker" | "in-process";

export type ZigWasiHostOptions = {
  /** Default `worker`. `in-process` is for the Node proof only — do not use on the Next server. */
  mode?: ZigWasiHostMode;
};

type TimeoutStage = "load" | "compile" | "run";

declare const __ZIG_WORKER_SOURCE__: string;

function classicWorkerFromSource(): Worker {
  const blob = new Blob([__ZIG_WORKER_SOURCE__], { type: "text/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

function timeoutResult(_stage: TimeoutStage, durationMs: number): HostRunResult {
  return {
    ok: false,
    stdout: "",
    stderr: "timed out",
    exitCode: null,
    durationMs,
    errorKind: "timeout",
  };
}

function unavailable(message: string): HostRunResult {
  return {
    ok: false,
    stdout: "",
    stderr: message,
    exitCode: null,
    durationMs: 0,
    errorKind: "unavailable",
  };
}

function asHostResult(err: unknown): HostRunResult {
  if (err instanceof WasiGuestError) {
    return {
      ok: false,
      stdout: "",
      stderr: err.kind === "timeout" ? "timed out" : err.message,
      exitCode: null,
      durationMs: 0,
      errorKind: err.kind,
    };
  }
  const message = err instanceof Error ? err.message : "unavailable";
  return unavailable(`unavailable: ${message}`);
}

type PendingJob = {
  id: number;
  loadTimeoutMs: number;
  compileTimeoutMs: number;
  runTimeoutMs: number;
  loadStartedAt: number | null;
  compileStartedAt: number | null;
  runStartedAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (result: HostRunResult) => void;
};

function browserWorkersAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof window !== "undefined";
}

/**
 * One-at-a-time WASI host. Default mode uses a browser Worker so compile/run
 * timeouts abort via worker.terminate() (WASI _start is synchronous).
 * Next.js must import this from a client module only.
 */
export class ZigWasiHost {
  private readonly mode: ZigWasiHostMode;
  private worker: Worker | null = null;
  private workerHeard = false;
  private usedBlobFallback = false;
  private lastPayload: ZigWorkerRequest | null = null;
  private nextId = 1;
  private queue: Promise<void> = Promise.resolve();
  private pending: PendingJob | null = null;
  private disposed = false;
  private readonly artifactCache = new Map<string, Uint8Array>();
  private readonly libTreeCache = new Map<string, Map<string, Inode>>();

  constructor(options: ZigWasiHostOptions = {}) {
    this.mode = options.mode ?? "worker";
  }

  async preload(artifacts: HostRunRequest["artifacts"], loadTimeoutMs?: number): Promise<HostRunResult> {
    if (this.disposed) return unavailable("unavailable: host has been disposed");
    return this.enqueue(async () => {
      if (this.disposed) return unavailable("unavailable: host has been disposed");
      if (this.mode === "in-process") return this.preloadInProcess(artifacts, loadTimeoutMs);
      if (!browserWorkersAvailable()) {
        return unavailable(
          "unavailable: WASI host requires a browser Worker (do not import from the server)",
        );
      }
      return this.postWorker({
        type: "preload",
        artifacts,
        loadTimeoutMs: loadTimeoutMs ?? WASM_LOAD_TIMEOUT_MS,
      });
    });
  }

  async run(req: HostRunRequest): Promise<HostRunResult> {
    if (this.disposed) return unavailable("unavailable: host has been disposed");
    const oversized = rejectOversizedSource(req.code);
    if (oversized) return oversized;

    return this.enqueue(async () => {
      if (this.disposed) return unavailable("unavailable: host has been disposed");
      if (this.mode === "in-process") return this.runInProcess(req);
      if (!browserWorkersAvailable()) {
        return unavailable(
          "unavailable: WASI host requires a browser Worker (do not import from the server)",
        );
      }
      return this.postWorker({
        type: "run",
        code: req.code,
        artifacts: req.artifacts,
        loadTimeoutMs: req.loadTimeoutMs ?? WASM_LOAD_TIMEOUT_MS,
        compileTimeoutMs: req.compileTimeoutMs ?? WASM_COMPILE_TIMEOUT_MS,
        runTimeoutMs: req.runTimeoutMs ?? WASM_RUN_TIMEOUT_MS,
      });
    });
  }

  async format(req: HostRunRequest): Promise<HostFormatResult> {
    if (this.disposed) {
      return { ok: false, code: req.code, stderr: "unavailable: host has been disposed", durationMs: 0, errorKind: "unavailable" };
    }
    const oversized = rejectOversizedSource(req.code);
    if (oversized) {
      return { ok: false, code: req.code, stderr: oversized.stderr, durationMs: 0, errorKind: oversized.errorKind };
    }

    const result = await this.enqueue(async () => {
      if (this.disposed) return unavailable("unavailable: host has been disposed");
      if (this.mode === "in-process") return this.formatInProcess(req);
      if (!browserWorkersAvailable()) {
        return unavailable(
          "unavailable: WASI host requires a browser Worker (do not import from the server)",
        );
      }
      return this.postWorker({
        type: "format",
        code: req.code,
        artifacts: req.artifacts,
        loadTimeoutMs: req.loadTimeoutMs ?? WASM_LOAD_TIMEOUT_MS,
        compileTimeoutMs: req.compileTimeoutMs ?? WASM_COMPILE_TIMEOUT_MS,
      });
    });

    return {
      ok: result.ok,
      code: result.ok ? result.stdout : req.code,
      stderr: result.stderr,
      durationMs: result.durationMs,
      errorKind: result.errorKind,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    if (this.pending) {
      this.pending.resolve(unavailable("unavailable: host has been disposed"));
      this.pending = null;
    }
    this.worker?.terminate();
    this.worker = null;
  }

  private enqueue(fn: () => Promise<HostRunResult>): Promise<HostRunResult> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async preloadInProcess(
    artifacts: HostRunRequest["artifacts"],
    loadTimeoutMs?: number,
  ): Promise<HostRunResult> {
    const started = Date.now();
    try {
      const loaded = await fetchZigArtifacts(artifacts, {
        cache: this.artifactCache,
        signal: loadTimeoutSignal(loadTimeoutMs ?? WASM_LOAD_TIMEOUT_MS),
      });
      if (!this.libTreeCache.has(artifacts.stdUrl)) {
        this.libTreeCache.set(artifacts.stdUrl, await unpackStdLib(loaded.stdArchive));
      }
      await probeZigWasm(loaded.zigWasm);
      return {
        ok: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      return asHostResult(err);
    }
  }

  private async runInProcess(req: HostRunRequest): Promise<HostRunResult> {
    try {
      const loadTimeoutMs = req.loadTimeoutMs ?? WASM_LOAD_TIMEOUT_MS;
      const loaded = await fetchZigArtifacts(req.artifacts, {
        cache: this.artifactCache,
        signal: loadTimeoutSignal(loadTimeoutMs),
      });
      let tree = this.libTreeCache.get(req.artifacts.stdUrl);
      if (!tree) {
        tree = await unpackStdLib(loaded.stdArchive);
        this.libTreeCache.set(req.artifacts.stdUrl, tree);
      }
      const compiled = await compileZigSource(req.code, loaded, cloneInodeTree(tree));
      if (!compiled.ok) return compiled.result;
      const ran = await runCompiledWasm(compiled.wasm);
      return { ...ran, durationMs: compiled.durationMs + ran.durationMs };
    } catch (err) {
      return asHostResult(err);
    }
  }

  private async formatInProcess(req: HostRunRequest): Promise<HostRunResult> {
    try {
      const loadTimeoutMs = req.loadTimeoutMs ?? WASM_LOAD_TIMEOUT_MS;
      const loaded = await fetchZigArtifacts(req.artifacts, {
        cache: this.artifactCache,
        signal: loadTimeoutSignal(loadTimeoutMs),
      });
      const formatted = await formatZigSource(req.code, loaded);
      if (!formatted.ok) return formatted.result;
      return {
        ok: true,
        stdout: formatted.code,
        stderr: "",
        exitCode: 0,
        durationMs: formatted.durationMs,
      };
    } catch (err) {
      return asHostResult(err);
    }
  }

  private postWorker(
    message:
      | {
          type: "preload";
          artifacts: HostRunRequest["artifacts"];
          loadTimeoutMs: number;
        }
      | {
          type: "format";
          code: string;
          artifacts: HostRunRequest["artifacts"];
          loadTimeoutMs: number;
          compileTimeoutMs: number;
        }
      | {
          type: "run";
          code: string;
          artifacts: HostRunRequest["artifacts"];
          loadTimeoutMs: number;
          compileTimeoutMs: number;
          runTimeoutMs: number;
        },
  ): Promise<HostRunResult> {
    const worker = this.ensureWorker();
    const id = this.nextId;
    this.nextId += 1;
    const compileTimeoutMs =
      message.type === "run" || message.type === "format"
        ? message.compileTimeoutMs
        : WASM_COMPILE_TIMEOUT_MS;
    const runTimeoutMs = message.type === "run" ? message.runTimeoutMs : WASM_RUN_TIMEOUT_MS;

    return new Promise((resolve) => {
      this.pending = {
        id,
        loadTimeoutMs: message.loadTimeoutMs,
        compileTimeoutMs,
        runTimeoutMs,
        loadStartedAt: null,
        compileStartedAt: null,
        runStartedAt: null,
        timer: null,
        resolve,
      };
      const payload: ZigWorkerRequest =
        message.type === "preload"
          ? {
              type: "preload",
              id,
              artifacts: message.artifacts,
              loadTimeoutMs: message.loadTimeoutMs,
            }
          : message.type === "format"
            ? {
                type: "format",
                id,
                code: message.code,
                artifacts: message.artifacts,
                loadTimeoutMs: message.loadTimeoutMs,
              }
            : {
                type: "run",
                id,
                code: message.code,
                artifacts: message.artifacts,
                loadTimeoutMs: message.loadTimeoutMs,
              };
      worker.postMessage(payload);
      this.lastPayload = payload;
    });
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    // Non-literal so the library bundler leaves a URL next to dist/zig.worker.js.
    const workerFile = "zig.worker.js";
    let worker: Worker;
    try {
      worker = new Worker(new URL(workerFile, import.meta.url));
    } catch {
      this.usedBlobFallback = true;
      worker = classicWorkerFromSource();
    }
    this.bindWorker(worker, !this.usedBlobFallback);
    return worker;
  }

  private bindWorker(worker: Worker, allowBlobFallback: boolean): void {
    this.worker = worker;
    this.workerHeard = false;
    worker.addEventListener("message", (event: MessageEvent<ZigWorkerEvent>) => {
      this.workerHeard = true;
      this.onWorkerEvent(event.data);
    });
    worker.addEventListener("error", (event) => {
      if (allowBlobFallback && !this.usedBlobFallback && !this.workerHeard) {
        this.usedBlobFallback = true;
        const payload = this.lastPayload;
        worker.terminate();
        const blobWorker = classicWorkerFromSource();
        this.bindWorker(blobWorker, false);
        if (payload) blobWorker.postMessage(payload);
        return;
      }
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      this.clearTimer();
      pending.resolve(unavailable(`unavailable: ${event.message || "worker error"}`));
      this.recycleWorker();
    });
  }

  private onWorkerEvent(event: ZigWorkerEvent | undefined): void {
    const pending = this.pending;
    if (!pending || !event || event.id !== pending.id) return;

    if (event.type === "stage") {
      if (event.stage === "fetch") {
        pending.loadStartedAt = Date.now();
        this.armTimer(pending, "load", pending.loadTimeoutMs);
      } else if (event.stage === "compile") {
        pending.compileStartedAt = Date.now();
        this.armTimer(pending, "compile", pending.compileTimeoutMs);
      } else if (event.stage === "run") {
        pending.runStartedAt = Date.now();
        this.armTimer(pending, "run", pending.runTimeoutMs);
      }
      return;
    }

    this.clearTimer();
    this.pending = null;
    pending.resolve(event.result);
  }

  private armTimer(job: PendingJob, stage: TimeoutStage, ms: number): void {
    this.clearTimer();
    const startedAt =
      stage === "load"
        ? (job.loadStartedAt ?? Date.now())
        : stage === "compile"
          ? (job.compileStartedAt ?? Date.now())
          : (job.runStartedAt ?? Date.now());
    job.timer = setTimeout(() => {
      if (this.pending !== job) return;
      this.pending = null;
      this.recycleWorker();
      job.resolve(timeoutResult(stage, Date.now() - startedAt));
    }, ms);
  }

  private clearTimer(): void {
    if (!this.pending?.timer) return;
    clearTimeout(this.pending.timer);
    this.pending.timer = null;
  }

  private recycleWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
