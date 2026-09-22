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
import type { HostRunResult } from "./wasi-guest";
import { WASM_LOAD_TIMEOUT_MS } from "./wasm-limits";
import type { ZigWorkerEvent, ZigWorkerRequest } from "./wasi-protocol";
import type { Inode } from "@bjorn3/browser_wasi_shim";

const artifactCache = new Map<string, Uint8Array>();
const libTreeCache = new Map<string, Map<string, Inode>>();

function post(event: ZigWorkerEvent): void {
  postMessage(event);
}

function asResult(err: unknown): HostRunResult {
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
  return {
    ok: false,
    stdout: "",
    stderr: `unavailable: ${message}`,
    exitCode: null,
    durationMs: 0,
    errorKind: "unavailable",
  };
}

async function libTreeFor(stdUrl: string, stdArchive: Uint8Array): Promise<Map<string, Inode>> {
  const hit = libTreeCache.get(stdUrl);
  if (hit) return cloneInodeTree(hit);
  const tree = await unpackStdLib(stdArchive);
  libTreeCache.set(stdUrl, tree);
  return cloneInodeTree(tree);
}

async function fetchArtifacts(
  artifacts: ZigWorkerRequest["artifacts"],
  loadTimeoutMs: number | undefined,
  id: number,
) {
  post({ type: "stage", id, stage: "fetch" });
  return fetchZigArtifacts(artifacts, {
    cache: artifactCache,
    signal: loadTimeoutSignal(loadTimeoutMs ?? WASM_LOAD_TIMEOUT_MS),
  });
}

async function loadArtifacts(
  artifacts: ZigWorkerRequest["artifacts"],
  loadTimeoutMs: number | undefined,
  id: number,
) {
  const loaded = await fetchArtifacts(artifacts, loadTimeoutMs, id);
  await libTreeFor(artifacts.stdUrl, loaded.stdArchive);
  return loaded;
}

async function handlePreload(req: Extract<ZigWorkerRequest, { type: "preload" }>): Promise<void> {
  const started = Date.now();
  const loaded = await loadArtifacts(req.artifacts, req.loadTimeoutMs, req.id);
  await probeZigWasm(loaded.zigWasm);
  post({
    type: "result",
    id: req.id,
    result: {
      ok: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
    },
  });
}

async function handleRun(req: Extract<ZigWorkerRequest, { type: "run" }>): Promise<void> {
  const oversized = rejectOversizedSource(req.code);
  if (oversized) {
    post({ type: "result", id: req.id, result: oversized });
    return;
  }

  const loaded = await loadArtifacts(req.artifacts, req.loadTimeoutMs, req.id);
  const libTree = await libTreeFor(req.artifacts.stdUrl, loaded.stdArchive);

  post({ type: "stage", id: req.id, stage: "compile" });
  const compiled = await compileZigSource(req.code, loaded, libTree);
  if (!compiled.ok) {
    post({ type: "result", id: req.id, result: compiled.result });
    return;
  }

  post({ type: "stage", id: req.id, stage: "run" });
  const ran = await runCompiledWasm(compiled.wasm);
  post({
    type: "result",
    id: req.id,
    result: { ...ran, durationMs: compiled.durationMs + ran.durationMs },
  });
}

async function handleFormat(req: Extract<ZigWorkerRequest, { type: "format" }>): Promise<void> {
  const oversized = rejectOversizedSource(req.code);
  if (oversized) {
    post({ type: "result", id: req.id, result: oversized });
    return;
  }

  const loaded = await fetchArtifacts(req.artifacts, req.loadTimeoutMs, req.id);

  post({ type: "stage", id: req.id, stage: "compile" });
  const formatted = await formatZigSource(req.code, loaded);
  if (!formatted.ok) {
    post({ type: "result", id: req.id, result: formatted.result });
    return;
  }
  post({
    type: "result",
    id: req.id,
    result: {
      ok: true,
      stdout: formatted.code,
      stderr: "",
      exitCode: 0,
      durationMs: formatted.durationMs,
    },
  });
}

addEventListener("message", (event: MessageEvent<ZigWorkerRequest>) => {
  const data = event.data;
  if (!data) return;
  if (data.type === "preload") {
    void handlePreload(data).catch((err: unknown) => {
      post({ type: "result", id: data.id, result: asResult(err) });
    });
    return;
  }
  if (data.type === "format") {
    void handleFormat(data).catch((err: unknown) => {
      post({ type: "result", id: data.id, result: asResult(err) });
    });
    return;
  }
  if (data.type !== "run") return;
  void handleRun(data).catch((err: unknown) => {
    post({ type: "result", id: data.id, result: asResult(err) });
  });
});
