"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { DEFAULT_ARTIFACT_BASE_URL } from "../default-artifacts";
import { acquireEditorAdapter, releaseEditorAdapter } from "../execution/adapter-slot";
import { MockAdapter } from "../execution/mock-adapter";
import { resolveArtifacts } from "../execution/resolve-artifacts";
import type {
  ExecutionAdapter,
  RunResult,
  RunStatus,
  ZigEditorProps,
  ZigEditorTheme,
} from "../execution/types";
import { WasmAdapter } from "../execution/wasm-adapter";
import { CodeEditor } from "./CodeEditor";
import { defaultLabels } from "./labels";
import {
  OUTPUT_DEFAULT_HEIGHT,
  OUTPUT_MAX_HEIGHT,
  OUTPUT_MIN_HEIGHT,
  OutputPanel,
} from "./OutputPanel";
import { Toolbar } from "./Toolbar";

const DEFAULT_COMPILE_TIMEOUT_MS = 60_000;
const DEFAULT_RUN_TIMEOUT_MS = 2_000;
const DEFAULT_LOAD_TIMEOUT_MS = 120_000;

function themeAttribute(theme: ZigEditorTheme, systemDark: boolean): "light" | "dark" {
  if (theme === "system") {
    return systemDark ? "dark" : "light";
  }
  return theme;
}

function initialDark(theme: ZigEditorTheme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ZigEditor({
  value,
  onChange,
  initialValue,
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
  showReset = true,
  labels: labelsProp,
  onRunResult,
  onStatus,
}: ZigEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onRunResultRef = useRef(onRunResult);
  const onStatusRef = useRef(onStatus);
  const onChangeRef = useRef(onChange);
  const adapterRef = useRef<ExecutionAdapter | null>(null);
  const runningRef = useRef(false);
  const formattingRef = useRef(false);
  const resetValueRef = useRef(initialValue ?? value);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canFormat, setCanFormat] = useState(false);
  const [preloadStatus, setPreloadStatus] = useState<RunStatus>("loading");
  const [result, setResult] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dark, setDark] = useState(() => initialDark(theme));
  const [outputHeight, setOutputHeight] = useState(OUTPUT_DEFAULT_HEIGHT);
  const [collapsed, setCollapsed] = useState(false);
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
    onChangeRef.current = onChange;
  }, [onChange, onRunResult, onStatus]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = themeAttribute(theme, media.matches);
      root.dataset.theme = next;
      setDark(next === "dark");
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
      setCanFormat(false);
      onStatusRef.current?.("unavailable");
    } else {
      setPreloadStatus("loading");
      setCanFormat(false);
      onStatusRef.current?.("loading");
      void Promise.resolve(adapter.status()).then((next) => {
        if (cancelled) return;
        setPreloadStatus(next);
        setCanFormat(Boolean(adapter.format));
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
    if (runningRef.current || formattingRef.current || preloadStatus === "loading") {
      return;
    }
    const adapter = adapterRef.current;
    if (!adapter) return;
    runningRef.current = true;
    setRunning(true);
    setResult(null);
    setNotice(null);
    setCollapsed(false);
    onStatusRef.current?.("running");
    try {
      const next = await adapter.run({
        code: value,
        channel: "default",
        expectedOutput,
        matchSources,
      });
      setResult(next);
      onStatusRef.current?.(next.ok ? "ok" : "error");
      onRunResultRef.current?.(next);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  async function handleFormat() {
    const format = adapterRef.current?.format;
    if (!format || runningRef.current || formattingRef.current) return;
    formattingRef.current = true;
    setFormatting(true);
    setNotice(null);
    try {
      const next = await format(value);
      if (next.ok) {
        onChangeRef.current(next.code);
      } else {
        setNotice(labels.formatFailed);
        setCollapsed(false);
      }
    } catch {
      setNotice(labels.formatFailed);
      setCollapsed(false);
    } finally {
      formattingRef.current = false;
      setFormatting(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setNotice(null);
    } catch {
      setCopied(false);
      setNotice(labels.copyFailed);
      setCollapsed(false);
    }
  }

  function onResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, startHeight: outputHeight };
    if (collapsed) setCollapsed(false);
  }

  function onResizeMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const delta = dragRef.current.startY - event.clientY;
    const next = Math.min(
      OUTPUT_MAX_HEIGHT,
      Math.max(OUTPUT_MIN_HEIGHT, dragRef.current.startHeight + delta),
    );
    setOutputHeight(next);
  }

  function onResizeEnd() {
    dragRef.current = null;
  }

  const rootClass = className ? `zig-editor ${className}` : "zig-editor";
  const busy = running || formatting;
  const runDisabled = busy || preloadStatus === "loading";

  return (
    <div ref={rootRef} className={rootClass}>
      <p className="zig-editor-hint">Press Mod-Enter to run. Press Escape to leave the editor.</p>
      <Toolbar
        runLabel={running ? labels.running : labels.run}
        formatLabel={formatting ? labels.formatting : labels.format}
        resetLabel={labels.reset}
        copyLabel={copied ? labels.copied : labels.copy}
        showFormat={canFormat}
        showReset={showReset}
        runDisabled={runDisabled}
        formatDisabled={busy}
        resetDisabled={value === resetValueRef.current}
        onRun={() => void handleRun()}
        onFormat={() => void handleFormat()}
        onReset={() => onChange(resetValueRef.current)}
        onCopy={() => void handleCopy()}
      />
      <div className="zig-editor-pane">
        <CodeEditor
          value={value}
          onChange={onChange}
          onRun={() => void handleRun()}
          dark={dark}
          readOnly={readOnly}
        />
      </div>
      <OutputPanel
        labels={labels}
        preloadStatus={preloadStatus}
        running={running}
        formatting={formatting}
        result={result}
        notice={notice}
        height={outputHeight}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((open) => !open)}
        onResizeStart={onResizeStart}
        onResizeMove={onResizeMove}
        onResizeEnd={onResizeEnd}
        onClear={() => {
          setResult(null);
          setNotice(null);
        }}
      />
    </div>
  );
}
