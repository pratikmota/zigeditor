import type { ZigEditorLabels } from "../execution/types";

export const defaultLabels: ZigEditorLabels = {
  run: "Run",
  running: "Running",
  format: "Format",
  formatting: "Formatting",
  reset: "Reset",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Couldn’t copy",
  formatFailed: "Couldn’t format",
  clear: "Clear",
  stdout: "stdout",
  stderr: "stderr",
  preview: "Preview runner — WASM compiler not connected.",
  loading: "Loading compiler…",
  unavailable: "In-browser compiler is unavailable. Using the preview runner.",
};
