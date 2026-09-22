import type { PointerEvent as ReactPointerEvent } from "react";

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
  height,
  collapsed,
  onToggleCollapsed,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onClear,
}: {
  labels: ZigEditorLabels;
  preloadStatus: RunStatus;
  running: boolean;
  formatting: boolean;
  result: RunResult | null;
  notice: string | null;
  height: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeEnd: () => void;
  onClear: () => void;
}) {
  const panelHeight = collapsed ? OUTPUT_COLLAPSED_HEIGHT : height;
  const stdout = result?.stdout ?? "";
  const stderr = [result?.stderr, notice].filter(Boolean).join("\n");
  const status = statusText({
    labels,
    preloadStatus,
    running,
    formatting,
    result,
  });

  return (
    <section
      className="zig-editor-output"
      style={{ height: panelHeight }}
      aria-label={`${labels.stdout} and ${labels.stderr}`}
    >
      <div className="zig-editor-output-status">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={status}
        >
          {status}
        </button>
        <button type="button" onClick={onClear}>
          {labels.clear}
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
            <pre className="zig-editor-stdout">{stdout}</pre>
            {stderr ? <pre className="zig-editor-stderr">{stderr}</pre> : null}
          </div>
        </>
      )}
    </section>
  );
}

function statusText({
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
  if (result?.preview) return labels.preview;
  if (result?.ok) return "ok";
  if (result && !result.ok) return "error";
  if (preloadStatus === "unavailable") return labels.unavailable;
  return "Output";
}
