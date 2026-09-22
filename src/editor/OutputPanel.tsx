import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { RunResult, RunStatus, ZigEditorLabels } from "../execution/types";

export const OUTPUT_DEFAULT_HEIGHT = 200;
export const OUTPUT_COLLAPSED_HEIGHT = 36;
export const OUTPUT_MIN_HEIGHT = 80;
export const OUTPUT_MAX_HEIGHT = 480;

export function OutputPanel({
  labels,
  preloadStatus,
  running,
  formatting,
  result,
  notice,
  showCopy,
  showClear,
  height,
  collapsed,
  onToggleCollapsed,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onClear,
  onCopyFailed,
}: {
  labels: ZigEditorLabels;
  preloadStatus: RunStatus;
  running: boolean;
  formatting: boolean;
  result: RunResult | null;
  notice: string | null;
  showCopy: boolean;
  showClear: boolean;
  height: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeEnd: () => void;
  onClear: () => void;
  onCopyFailed: () => void;
}) {
  const panelHeight = collapsed ? OUTPUT_COLLAPSED_HEIGHT : height;
  const stdout = result?.stdout ?? "";
  const stderr = [result?.stderr, notice].filter(Boolean).join("\n");
  const stderrDanger = Boolean(notice) || Boolean(result && !result.ok && !result.preview);
  const outputText = [stdout, stderr].filter(Boolean).join("\n");
  const [copiedOutput, setCopiedOutput] = useState(false);

  useEffect(() => {
    if (!copiedOutput) return;
    const timer = setTimeout(() => setCopiedOutput(false), 1500);
    return () => clearTimeout(timer);
  }, [copiedOutput]);
  const quiet = quietText({ labels, preloadStatus, running, formatting, result });
  const badge = badgeText({ labels, running, formatting, preloadStatus, result });

  return (
    <section
      className="zig-editor-output"
      style={{ height: panelHeight }}
      aria-label={`${labels.stdout} and ${labels.stderr}`}
    >
      <div className="zig-editor-output-status">
        <span className="zig-editor-output-toggle">{labels.output}</span>
        <div className="zig-editor-output-meta">
          {quiet ? <span className="zig-editor-quiet">{quiet}</span> : null}
          {badge ? <span className={`zig-editor-badge zig-editor-badge-${badge.kind}`}>{badge.text}</span> : null}
          {result ? <span className="zig-editor-elapsed">{result.durationMs} ms</span> : null}
        </div>
        {collapsed ? null : (
          <div className="zig-editor-output-actions">
            {showCopy ? (
              <button
                type="button"
                className="zig-editor-ghost"
                onClick={() => void copyOutput(outputText, setCopiedOutput, onCopyFailed)}
                disabled={!outputText}
              >
                <CopyIcon />
                {copiedOutput ? labels.copied : labels.copy}
              </button>
            ) : null}
            {showClear ? (
              <button type="button" className="zig-editor-ghost" onClick={onClear}>
                <EraserIcon />
                {labels.clear}
              </button>
            ) : null}
          </div>
        )}
        <button
          type="button"
          className="zig-editor-chevron-button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={labels.output}
        >
          <Chevron collapsed={collapsed} />
        </button>
      </div>
      {collapsed ? null : (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize output"
            className="zig-editor-resize"
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
          />
          <div className="zig-editor-output-body">
            {!result && !notice && !running && !formatting && preloadStatus !== "loading" ? (
              <p className="zig-editor-empty">
                {preloadStatus === "unavailable" ? labels.unavailable : labels.empty}
              </p>
            ) : (
              <>
                {stdout ? <pre className="zig-editor-stdout">{stdout}</pre> : null}
                {stderr ? (
                  <pre className={stderrDanger ? "zig-editor-stderr zig-editor-stderr-danger" : "zig-editor-stderr"}>
                    {stderr}
                  </pre>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="5.5" y="5.5" width="7" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 10.5H3.5A1.5 1.5 0 0 1 2 9V3.5A1.5 1.5 0 0 1 3.5 2H9a1.5 1.5 0 0 1 1.5 1.5V4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.2 11.2 8.2 6.2l2.2 2.2-5 5H3.2v-2.2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.8 13.4h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={collapsed ? "zig-editor-chevron zig-editor-chevron-collapsed" : "zig-editor-chevron"}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

async function copyOutput(text: string, onCopied: (copied: boolean) => void, onCopyFailed: () => void) {
  try {
    await navigator.clipboard.writeText(text);
    onCopied(true);
  } catch {
    onCopied(false);
    onCopyFailed();
  }
}

function quietText({
  labels,
  preloadStatus,
  running,
  formatting,
  result,
}: {
  labels: ZigEditorLabels;
  preloadStatus: RunStatus;
  running: boolean;
  formatting: boolean;
  result: RunResult | null;
}) {
  if (running) return labels.running;
  if (formatting) return labels.formatting;
  if (preloadStatus === "loading") return labels.loading;
  return "";
}

function badgeText({
  labels,
  running,
  formatting,
  preloadStatus,
  result,
}: {
  labels: ZigEditorLabels;
  running: boolean;
  formatting: boolean;
  preloadStatus: RunStatus;
  result: RunResult | null;
}): { kind: "ok" | "error" | "preview"; text: string } | null {
  if (running || formatting || preloadStatus === "loading" || !result) return null;
  if (result.preview) return { kind: "preview", text: labels.preview };
  if (result.ok) return { kind: "ok", text: labels.ok };
  return { kind: "error", text: labels.error };
}
