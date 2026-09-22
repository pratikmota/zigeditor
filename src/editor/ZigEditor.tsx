"use client";

import { useEffect, useRef, useState } from "react";

import { MockAdapter } from "../execution/mock-adapter";
import type { ZigEditorProps, ZigEditorTheme } from "../execution/types";
import { defaultLabels } from "./labels";

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
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const labels = { ...defaultLabels, ...labelsProp };
  const artifactKey = [
    artifacts?.moduleUrl ?? "",
    artifacts?.stdUrl ?? "",
    artifacts?.compilerRtUrl ?? "",
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
    // Phase 2 never preloads zig.wasm, so the compiler stays unavailable.
    // URL strings, not the artifacts object, so a new object with the same
    // URLs does not wipe "running", "ok", or "error".
    onStatusRef.current?.("unavailable");
  }, [artifactKey]);

  async function handleRun() {
    if (runningRef.current) {
      return;
    }
    runningRef.current = true;
    setRunning(true);
    onStatusRef.current?.("running");
    try {
      const result = await new MockAdapter(compilerLabel).run({
        code: value,
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

  return (
    <div ref={rootRef} className={rootClass}>
      <textarea
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        aria-label="Zig source"
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" onClick={() => void handleRun()} disabled={running}>
        {running ? labels.running : labels.run}
      </button>
    </div>
  );
}
