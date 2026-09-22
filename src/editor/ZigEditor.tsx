"use client";

import { useEffect, useRef, useState } from "react";

import { DEFAULT_ARTIFACT_BASE_URL } from "../default-artifacts";
import { acquireEditorAdapter, releaseEditorAdapter } from "../execution/adapter-slot";
import { MockAdapter } from "../execution/mock-adapter";
import { resolveArtifacts } from "../execution/resolve-artifacts";
import type { ExecutionAdapter, RunStatus, ZigEditorProps, ZigEditorTheme } from "../execution/types";
import { WasmAdapter } from "../execution/wasm-adapter";
import { defaultLabels } from "./labels";

const DEFAULT_COMPILE_TIMEOUT_MS = 60_000;
const DEFAULT_RUN_TIMEOUT_MS = 2_000;
const DEFAULT_LOAD_TIMEOUT_MS = 120_000;

function themeAttribute(theme: ZigEditorTheme, systemDark: boolean): "light" | "dark" {
  if (theme === "system") {
    return systemDark ? "dark" : "light";
  }
  return theme;
}

export function ZigEditor({
  value,
  onChange,
  theme = "system",
  className,
  readOnly = false,
  artifacts,
  compileTimeoutMs = DEFAULT_COMPILE_TIMEOUT_MS,
  runTimeoutMs = DEFAULT_RUN_TIMEOUT_MS,
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  expectedOutput,
  matchSources,
  compilerLabel = "Zig",
  labels: labelsProp,
  onRunResult,
  onStatus,
}: ZigEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onRunResultRef = useRef(onRunResult);
  const onStatusRef = useRef(onStatus);
  const adapterRef = useRef<ExecutionAdapter | null>(null);
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [preloadStatus, setPreloadStatus] = useState<RunStatus>("loading");
  const labels = { ...defaultLabels, ...labelsProp };
  const artifactKey = [
    artifacts?.moduleUrl ?? "",
    artifacts?.stdUrl ?? "",
    artifacts?.compilerRtUrl ?? "",
    DEFAULT_ARTIFACT_BASE_URL,
    String(compileTimeoutMs),
    String(runTimeoutMs),
    String(loadTimeoutMs),
    compilerLabel,
  ].join("\0");

  useEffect(() => {
    onRunResultRef.current = onRunResult;
    onStatusRef.current = onStatus;
  }, [onRunResult, onStatus]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.dataset.theme = themeAttribute(theme, media.matches);
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
    };
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const resolved = resolveArtifacts(artifacts, DEFAULT_ARTIFACT_BASE_URL);
    const adapter = acquireEditorAdapter(artifactKey, () => {
      if (!resolved) return new MockAdapter(compilerLabel);
      return new WasmAdapter({
        channel: "default",
        artifacts: resolved,
        compileTimeoutMs,
        runTimeoutMs,
        loadTimeoutMs,
        compilerLabel,
      });
    });
    adapterRef.current = adapter;

    if (!resolved) {
      setPreloadStatus("unavailable");
      onStatusRef.current?.("unavailable");
    } else {
      setPreloadStatus("loading");
      onStatusRef.current?.("loading");
      void Promise.resolve(adapter.status()).then((next) => {
        if (cancelled) return;
        setPreloadStatus(next);
        onStatusRef.current?.(next);
      });
    }

    return () => {
      cancelled = true;
      if (adapterRef.current === adapter) adapterRef.current = null;
      releaseEditorAdapter(adapter);
    };
  }, [artifactKey]);

  async function handleRun() {
    if (runningRef.current || preloadStatus === "loading") {
      return;
    }
    const adapter = adapterRef.current;
    if (!adapter) return;
    runningRef.current = true;
    setRunning(true);
    onStatusRef.current?.("running");
    try {
      const result = await adapter.run({
        code: value,
        channel: "default",
        expectedOutput,
        matchSources,
      });
      onStatusRef.current?.(result.ok ? "ok" : "error");
      onRunResultRef.current?.(result);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  const rootClass = className ? `zig-editor ${className}` : "zig-editor";
  const runDisabled = running || preloadStatus === "loading";

  return (
    <div ref={rootRef} className={rootClass}>
      <textarea
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        aria-label="Zig source"
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" onClick={() => void handleRun()} disabled={runDisabled}>
        {running ? labels.running : labels.run}
      </button>
    </div>
  );
}
